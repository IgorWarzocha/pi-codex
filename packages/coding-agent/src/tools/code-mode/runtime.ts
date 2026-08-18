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
import type { PublicCodeModeRuntime } from "./public-tools.ts";
import type { CodeModeToolDefinition, CustomToolDefinition, RuntimeResponse, ToolExecutionContext } from "./types.ts";

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
	shutdown(): Promise<void>;
}

export interface CodeModeRuntimeOptions {
	agentDir: string;
	cwd: string;
	getTools(ctx?: ExtensionContext): CodeModeToolDefinition[];
	richRendering?: boolean;
}

export class CodeModeRuntime implements PublicCodeModeRuntime {
	private readonly agentDir: string;
	private readonly cwd: string;
	private readonly getTools: CodeModeRuntimeOptions["getTools"];
	private readonly richRendering: boolean;
	private clientPromise: Promise<CodeModeHostClient> | undefined;
	private startupAbort: AbortController | undefined;
	private preflightBroker: CodeModePreflightBroker | undefined;
	private customPromptState = new Map<string, boolean>();
	private promptSection: string | undefined;
	private previousErrors = new Map<string, string>();
	readonly preflight = async (call: Parameters<CodeModePreflightBroker["run"]>[0]): Promise<void> => {
		await this.preflightBroker?.run(call);
	};

	constructor(options: CodeModeRuntimeOptions) {
		this.agentDir = options.agentDir;
		this.cwd = options.cwd;
		this.getTools = options.getTools;
		this.richRendering = options.richRendering ?? false;
	}

	bindEvents(events: EventBus): void {
		this.preflightBroker?.dispose();
		this.preflightBroker = createCodeModePreflightBroker(events);
	}

	async getClient(): Promise<CodeModeExecutionClient> {
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

	prepare(): Promise<void> {
		return this.getClient().then(() => undefined);
	}

	collectTools(ctx?: unknown): CodeModeToolDefinition[] {
		const extensionContext = isExtensionContext(ctx) ? ctx : undefined;
		const programmatic = this.getTools(extensionContext);
		const custom = this.discoverCustomTools(extensionContext);
		return collectUniqueTools([
			...programmatic,
			...custom.map((tool) => ({
				...tool,
				deferLoading: this.customPromptState.get(tool.name) ?? tool.deferLoading,
			})),
		]);
	}

	collectRenderTools(): CodeModeToolDefinition[] {
		return this.getTools();
	}

	useRichRendering(): boolean {
		return this.richRendering;
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
