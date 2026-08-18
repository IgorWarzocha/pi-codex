import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventBus } from "../../core/event-bus.ts";
import type { ExtensionContext } from "../../core/extensions/types.ts";
import { ensureCodeModeHostBinary } from "./binary.ts";
import { buildCodeModeToolsPrompt } from "./custom-tool-prompt.ts";
import {
	type CustomToolDiscoveryError,
	discoverCustomToolsFromDirectories,
	getCustomToolsDir,
	getProjectCustomToolsDir,
} from "./custom-tools.ts";
import { CodeModeHostClient } from "./host-client.ts";
import { type CodeModePreflightBroker, createCodeModePreflightBroker } from "./nested-tool-preflight.ts";
import { createNotebookControlProxy } from "./notebook-tool.ts";
import type { PublicCodeModeRuntime } from "./public-tools.ts";
import type {
	CodeModeToolDefinition,
	CustomToolDefinition,
	NotebookControlRequest,
	NotebookControlResult,
	RuntimeResponse,
	ToolExecutionContext,
} from "./types.ts";

export type CodeModeExecutionKind = "code" | "notebook";

export interface NotebookRuntimeOptions {
	maxHeapMiB: number;
	agentDir: string;
	profile?: string | undefined;
}

export interface CodeModeExecutionClient {
	execute(
		source: string,
		context: ToolExecutionContext,
		signal?: AbortSignal,
		tools?: CodeModeToolDefinition[],
	): Promise<RuntimeResponse>;
	wait(
		cellId: string,
		yieldTimeMs: number,
		context: ToolExecutionContext,
		signal?: AbortSignal,
	): Promise<RuntimeResponse>;
	terminate(cellId: string, context: ToolExecutionContext, signal?: AbortSignal): Promise<RuntimeResponse>;
	checkpoint?(): Promise<void>;
	controlNotebook?(
		request: NotebookControlRequest,
		context: ToolExecutionContext,
		signal?: AbortSignal,
	): Promise<NotebookControlResult>;
	shutdown(): Promise<void>;
}

export interface CodeModeRuntimeOptions {
	agentDir: string;
	cwd: string;
	getTools(ctx?: ExtensionContext): CodeModeToolDefinition[];
	getNotebookOptions(): NotebookRuntimeOptions;
	richRendering?: boolean;
}

export class CodeModeRuntime implements PublicCodeModeRuntime {
	private readonly agentDir: string;
	private readonly cwd: string;
	private readonly getTools: CodeModeRuntimeOptions["getTools"];
	private readonly getNotebookOptions: CodeModeRuntimeOptions["getNotebookOptions"];
	private readonly richRendering: boolean;
	private clientPromise: Promise<CodeModeHostClient> | undefined;
	private notebookClientPromise: Promise<CodeModeExecutionClient> | undefined;
	private notebookClientOptionsKey: string | undefined;
	private notebookClientTransition: Promise<void> = Promise.resolve();
	private startupAbort: AbortController | undefined;
	private preflightBroker: CodeModePreflightBroker | undefined;
	private customPromptState = new Map<string, boolean>();
	private promptSection: string | undefined;
	private previousErrors = new Map<string, string>();
	private executionKind: CodeModeExecutionKind = "code";
	readonly preflight = async (call: Parameters<CodeModePreflightBroker["run"]>[0]): Promise<void> => {
		await this.preflightBroker?.run(call);
	};

	constructor(options: CodeModeRuntimeOptions) {
		this.agentDir = options.agentDir;
		this.cwd = options.cwd;
		this.getTools = options.getTools;
		this.getNotebookOptions = options.getNotebookOptions;
		this.richRendering = options.richRendering ?? false;
	}

	setExecutionKind(kind: CodeModeExecutionKind): void {
		this.executionKind = kind;
	}

	bindEvents(events: EventBus): void {
		this.preflightBroker?.dispose();
		this.preflightBroker = createCodeModePreflightBroker(events);
	}

	async getClient(): Promise<CodeModeExecutionClient> {
		if (this.executionKind === "notebook") return this.getNotebookClient();
		if (!this.clientPromise) {
			const startupAbort = new AbortController();
			const pending = ensureCodeModeHostBinary(startupAbort.signal, {
				agentDir: this.agentDir,
			}).then((binary) => new CodeModeHostClient({ binary, tools: [] }));
			this.clientPromise = pending;
			this.startupAbort = startupAbort;
			void pending.then(
				() => {
					if (this.clientPromise === pending) this.startupAbort = undefined;
				},
				() => {
					if (this.clientPromise !== pending) return;
					this.clientPromise = undefined;
					this.startupAbort = undefined;
				},
			);
		}
		return this.clientPromise;
	}

	private getNotebookClient(): Promise<CodeModeExecutionClient> {
		const options = this.getNotebookOptions();
		const key = JSON.stringify([options.agentDir, options.maxHeapMiB, options.profile ?? null]);
		if (this.notebookClientPromise && this.notebookClientOptionsKey === key) return this.notebookClientPromise;
		const transition = this.notebookClientTransition.then(async () => {
			if (this.notebookClientPromise && this.notebookClientOptionsKey !== key) {
				const previous = this.notebookClientPromise;
				this.notebookClientPromise = undefined;
				this.notebookClientOptionsKey = undefined;
				await (await previous).shutdown();
			}
			if (!this.notebookClientPromise) {
				const pending = import("../notebook-mode/client.ts").then(
					({ NotebookCodeModeClient }) => new NotebookCodeModeClient(options),
				);
				this.notebookClientPromise = pending;
				this.notebookClientOptionsKey = key;
				void pending.catch(() => {
					if (this.notebookClientPromise !== pending) return;
					this.notebookClientPromise = undefined;
					this.notebookClientOptionsKey = undefined;
				});
			}
			return this.notebookClientPromise;
		});
		this.notebookClientTransition = transition.then(
			() => undefined,
			() => undefined,
		);
		return transition;
	}

	prepare(): Promise<void> {
		return this.getClient().then(() => undefined);
	}

	collectTools(ctx?: unknown): CodeModeToolDefinition[] {
		const extensionContext = isExtensionContext(ctx) ? ctx : undefined;
		const programmatic = this.getTools(extensionContext);
		const custom = this.discoverCustomTools(extensionContext);
		const tools = collectUniqueTools([
			...programmatic,
			...custom.map((tool) => ({
				...tool,
				deferLoading: this.customPromptState.get(tool.name) ?? tool.deferLoading,
			})),
		]);
		if (this.executionKind !== "notebook") return tools;
		if (tools.some((tool) => tool.name === "notebook")) throw new Error("Duplicate code-mode tool: notebook");
		return [...tools, createNotebookControlProxy(this)];
	}

	collectRenderTools(): CodeModeToolDefinition[] {
		return this.getTools();
	}

	useRichRendering(): boolean {
		return this.executionKind === "notebook" || this.richRendering;
	}

	buildPromptSection(projectTrusted: boolean): string {
		if (this.promptSection !== undefined) return this.promptSection;
		const programmatic = this.getTools();
		const custom = this.discoverCustomToolsForTrust(projectTrusted);
		this.customPromptState = new Map(custom.map((tool) => [tool.name, tool.deferLoading]));
		this.promptSection = buildCodeModeToolsPrompt(
			collectUniqueTools([...programmatic, ...custom]),
			codeModeCustomToolsDocumentationPath(),
		);
		return this.promptSection;
	}

	resetPromptTools(): void {
		this.promptSection = undefined;
		this.customPromptState.clear();
	}

	async shutdownHost(): Promise<void> {
		await this.notebookClientTransition;
		while (this.clientPromise) {
			const pending = this.clientPromise;
			this.clientPromise = undefined;
			this.startupAbort?.abort();
			this.startupAbort = undefined;
			try {
				await (await pending).shutdown();
			} catch {
				// Startup failure already reached the caller.
			}
		}
		while (this.notebookClientPromise) {
			const pending = this.notebookClientPromise;
			this.notebookClientPromise = undefined;
			this.notebookClientOptionsKey = undefined;
			try {
				await (await pending).shutdown();
			} catch {
				// Startup failure already reached the caller.
			}
		}
	}

	async checkpointNotebook(): Promise<void> {
		const pending = this.notebookClientPromise;
		if (!pending) return;
		await (await pending).checkpoint?.();
	}

	async controlNotebook(
		request: NotebookControlRequest,
		context: ToolExecutionContext,
		signal?: AbortSignal,
	): Promise<NotebookControlResult> {
		if (this.executionKind !== "notebook") throw new Error("notebook is available only in Notebook Mode");
		const client = await this.getNotebookClient();
		if (!client.controlNotebook) throw new Error("Notebook lifecycle controls are unavailable");
		return client.controlNotebook(request, context, signal);
	}

	async shutdown(): Promise<void> {
		this.preflightBroker?.dispose();
		this.preflightBroker = undefined;
		await this.shutdownHost();
	}

	private discoverCustomTools(ctx?: ExtensionContext): CustomToolDefinition[] {
		const trusted = ctx?.isProjectTrusted() ?? false;
		const discovery = this.discover(trusted);
		this.reportErrors(ctx, discovery.errors);
		return discovery.tools;
	}

	private discoverCustomToolsForTrust(projectTrusted: boolean): CustomToolDefinition[] {
		return this.discover(projectTrusted).tools;
	}

	private discover(projectTrusted: boolean) {
		const dirs = [getCustomToolsDir(this.agentDir)];
		if (projectTrusted) dirs.push(getProjectCustomToolsDir(this.cwd));
		return discoverCustomToolsFromDirectories(dirs);
	}

	private reportErrors(ctx: ExtensionContext | undefined, errors: CustomToolDiscoveryError[]): void {
		const current = new Map(errors.map((error) => [error.path, error.message]));
		if (ctx) {
			for (const error of errors) {
				if (this.previousErrors.get(error.path) === error.message) continue;
				ctx.ui.notify(`Code Mode custom tool disabled: ${error.message}`, "error");
			}
		}
		this.previousErrors = current;
	}
}

function isExtensionContext(value: unknown): value is ExtensionContext {
	return Boolean(
		value && typeof value === "object" && "isProjectTrusted" in value && typeof value.isProjectTrusted === "function",
	);
}

function codeModeCustomToolsDocumentationPath(): string {
	return join(dirname(fileURLToPath(import.meta.url)), "CUSTOM-TOOLS.md");
}

function collectUniqueTools(tools: CodeModeToolDefinition[]): CodeModeToolDefinition[] {
	const names = new Set<string>();
	for (const tool of tools) {
		if (names.has(tool.name)) throw new Error(`Duplicate code-mode tool: ${tool.name}`);
		names.add(tool.name);
	}
	return tools;
}
