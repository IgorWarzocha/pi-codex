import type { Agent } from "@earendil-works/pi-agent-core";
import type { Api, Model, ModelThinkingLevel } from "@earendil-works/pi-ai";
import {
	type CodexDiagnosticsSink,
	type CodexPrewarmResult,
	prewarmOpenAICodexWebSocket,
	type ResponsesBody,
} from "@earendil-works/pi-ai/providers/openai-codex";
import { type CodexConversionConfig, resolveNativePiCodexConfig } from "../adapter/activation/config.ts";
import {
	handleCodexSessionBeforeCompact,
	injectPendingNativeWindowIntoPiCompactionRequest,
	type NativeCompactionContext,
	type NativeCompactionDecision,
	type NativeCompactionRequest,
	type NativeCompactionState,
	rewriteCodexCompactedProviderRequest,
} from "../adapter/compaction/compaction.ts";
import { createLazyCodexDiagnostics } from "../diagnostics/lazy.ts";
import type { CodexExecutionMode } from "../tools/runtime.ts";
import type { ExtensionUIContext } from "./extensions/types.ts";
import { ModelRegistry } from "./model-registry.ts";
import type { ModelRuntime } from "./model-runtime.ts";
import type { SessionManager } from "./session-manager.ts";
import type { SettingsManager } from "./settings-manager.ts";

const KEEPALIVE_INTERVAL_MS = 25 * 60 * 1_000;

type CodexRuntimeUi = Pick<ExtensionUIContext, "notify" | "setStatus" | "theme">;

export interface CodexSessionRuntimeOptions {
	agent: Agent;
	modelRuntime: ModelRuntime;
	settingsManager: SettingsManager;
	sessionManager: SessionManager;
	cwd: string;
	agentDir: string;
	getExecutionMode(): CodexExecutionMode;
	getUi(): CodexRuntimeUi | undefined;
	isIdle(): boolean;
	prewarm?: typeof prewarmOpenAICodexWebSocket;
}

function isAbortError(error: unknown): boolean {
	return error instanceof Error && (error.name === "AbortError" || /aborted/i.test(error.message));
}

export class CodexSessionRuntime {
	private readonly options: CodexSessionRuntimeOptions;
	private readonly diagnostics = createLazyCodexDiagnostics();
	private readonly prewarmProvider: typeof prewarmOpenAICodexWebSocket;
	private readonly modelRegistry: ModelRegistry;
	private readonly compactionState: NativeCompactionState;
	private controller: AbortController | undefined;
	private pending: Promise<unknown> | undefined;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private cacheKeepaliveRequest: ResponsesBody | undefined;

	constructor(options: CodexSessionRuntimeOptions) {
		this.options = options;
		this.prewarmProvider = options.prewarm ?? prewarmOpenAICodexWebSocket;
		this.modelRegistry = new ModelRegistry(options.modelRuntime);
		const config = this.config();
		this.compactionState = {
			config,
			executionMode: config.executionMode,
		};
	}

	private model(): Model<Api> | undefined {
		return this.options.agent.state.model as Model<Api> | undefined;
	}

	private config(): CodexConversionConfig {
		return resolveNativePiCodexConfig({
			settings: this.options.settingsManager.getPiCodexSettings(),
			executionMode: this.options.settingsManager.getExecutionMode(),
			notebook: this.options.settingsManager.getNotebookSettings(),
		});
	}

	private notify(message: string, level: "info" | "warning" | "error"): void {
		this.options.getUi()?.notify(message, level);
	}

	private compactionContext(): NativeCompactionContext {
		return {
			model: this.model(),
			modelRegistry: this.modelRegistry,
			sessionManager: this.options.sessionManager,
			systemPrompt: this.options.agent.state.systemPrompt,
			thinkingLevel: this.options.agent.state.thinkingLevel as ModelThinkingLevel,
			tools: this.options.agent.state.tools,
			diagnostics: this.diagnostics.sink(),
			notify: (message, level) => this.notify(message, level),
		};
	}

	private refreshCompactionState(): void {
		const config = this.config();
		this.compactionState.config = config;
		this.compactionState.executionMode = config.executionMode;
		this.compactionState.activeProviderSystemPrompt = this.options.agent.state.systemPrompt;
	}

	private cancelPrewarm(): void {
		this.controller?.abort();
		this.controller = undefined;
	}

	private cancelTimer(): void {
		if (this.timer) clearTimeout(this.timer);
		this.timer = undefined;
	}

	private cancel(): void {
		this.cancelPrewarm();
		this.cancelTimer();
	}

	private track<T>(operation: Promise<T>): Promise<T> {
		this.pending = operation;
		void operation
			.finally(() => {
				if (this.pending === operation) this.pending = undefined;
			})
			.catch(() => undefined);
		return operation;
	}

	private async configureDiagnostics(): Promise<void> {
		const ui = this.options.getUi();
		if (!ui) return;
		const model = this.model();
		const config = this.config();
		try {
			await this.diagnostics.configure({
				mode: config.openai.cacheDiagnostics,
				active: model?.provider === "openai-codex",
				context: {
					cwd: this.options.cwd,
					model,
					sessionManager: this.options.sessionManager,
					ui,
				},
				agentDir: this.options.agentDir,
			});
		} catch (error) {
			this.notify(
				`Codex cache diagnostics failed: ${error instanceof Error ? error.message : String(error)}`,
				"warning",
			);
		}
	}

	diagnosticsSink(): CodexDiagnosticsSink | undefined {
		return this.diagnostics.sink();
	}

	capturePreparedRequest(payload: ResponsesBody): void {
		if (this.config().openai.cacheKeepalive) this.cacheKeepaliveRequest = structuredClone(payload);
	}

	private async prewarm(
		messages: "empty" | "current",
		preparedBody?: ResponsesBody,
	): Promise<CodexPrewarmResult | undefined> {
		const model = this.model();
		const config = this.config();
		if (
			model?.provider !== "openai-codex" ||
			model.api !== "openai-codex-responses" ||
			!config.openai.forceCachedWebSockets
		)
			return undefined;

		this.cancelPrewarm();
		const controller = new AbortController();
		this.controller = controller;
		try {
			const resolution = await this.options.modelRuntime.getAuth(model);
			const apiKey = resolution?.auth.apiKey;
			if (!apiKey || controller.signal.aborted) return undefined;
			const requestModel = resolution.auth.baseUrl ? { ...model, baseUrl: resolution.auth.baseUrl } : model;
			const context = await this.options.agent.buildProviderContext(
				{
					systemPrompt: this.options.agent.state.systemPrompt,
					messages: messages === "current" ? this.options.agent.state.messages.slice() : [],
					tools: this.options.agent.state.tools.slice(),
				},
				controller.signal,
			);
			if (controller.signal.aborted) return undefined;
			const thinkingLevel = this.options.agent.state.thinkingLevel;
			return await this.prewarmProvider(
				requestModel,
				context,
				{
					apiKey,
					headers: resolution.auth.headers,
					env: resolution.env,
					sessionId: this.options.sessionManager.getSessionId(),
					signal: controller.signal,
					executionMode: this.options.getExecutionMode(),
					forceCachedWebSockets: config.openai.forceCachedWebSockets,
					fast: config.openai.fast,
					responsesCompaction: config.compaction.responsesCompaction,
					textVerbosity: config.openai.verbosity,
					diagnostics: this.diagnostics.sink(),
					...(thinkingLevel === "off" ? {} : { reasoningEffort: thinkingLevel }),
				},
				preparedBody ? { preparedBody, preserveContinuation: true } : undefined,
			);
		} finally {
			if (this.controller === controller) this.controller = undefined;
		}
	}

	async prepareTurn(): Promise<void> {
		this.cancelTimer();
		await this.configureDiagnostics();
		await this.track(
			this.prewarm("empty").catch((error: unknown) => {
				if (!isAbortError(error))
					this.notify(
						`Codex cache prewarm failed: ${error instanceof Error ? error.message : String(error)}`,
						"warning",
					);
				return undefined;
			}),
		);
	}

	agentStarted(): void {
		this.cancelTimer();
	}

	async agentSettled(): Promise<void> {
		await this.configureDiagnostics();
		this.armKeepalive();
	}

	beforeCompaction(): void {
		this.cancel();
	}

	async compact(request: NativeCompactionRequest): Promise<NativeCompactionDecision> {
		this.beforeCompaction();
		this.refreshCompactionState();
		return await handleCodexSessionBeforeCompact(request, this.compactionContext(), this.compactionState);
	}

	async rewriteProviderRequest(payload: unknown): Promise<unknown | undefined> {
		this.refreshCompactionState();
		const context = this.compactionContext();
		const fallback = await injectPendingNativeWindowIntoPiCompactionRequest(payload, context, this.compactionState);
		return fallback ?? (await rewriteCodexCompactedProviderRequest(payload, context, this.compactionState));
	}

	afterCompaction(): void {
		this.compactionState.pendingPiCompactionNativeWindow = undefined;
		this.cacheKeepaliveRequest = undefined;
		this.track(
			this.prewarm("current").catch((error: unknown) => {
				if (!isAbortError(error))
					this.notify(
						`Codex post-compaction prewarm failed: ${error instanceof Error ? error.message : String(error)}`,
						"warning",
					);
			}),
		);
	}

	async modelChanged(): Promise<void> {
		this.cancel();
		this.cacheKeepaliveRequest = undefined;
		await this.configureDiagnostics();
	}

	private armKeepalive(): void {
		this.cancelTimer();
		const config = this.config();
		if (!config.openai.cacheKeepalive) return;
		this.timer = setTimeout(() => {
			this.timer = undefined;
			if (!this.options.isIdle()) return;
			const preparedBody = this.cacheKeepaliveRequest;
			if (!preparedBody) return;
			this.track(
				this.prewarm("current", preparedBody)
					.then((result) => {
						if (!result) return;
						this.notify(`Codex cache keepalive refreshed · WS ${result.socketReused ? "reused" : "new"}`, "info");
						this.armKeepalive();
					})
					.catch((error: unknown) => {
						if (isAbortError(error)) return;
						this.notify(
							`Codex cache keepalive failed: ${error instanceof Error ? error.message : String(error)}`,
							"warning",
						);
						this.armKeepalive();
					}),
			);
		}, KEEPALIVE_INTERVAL_MS);
		this.timer.unref?.();
	}

	async shutdown(): Promise<void> {
		this.cancel();
		await this.pending?.catch(() => undefined);
		this.pending = undefined;
		await this.diagnostics.shutdown();
	}
}
