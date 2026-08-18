import type { Api, Context, Model, SimpleStreamOptions } from "@earendil-works/pi-ai";
import { type CodexConversionConfig, resolveNativePiCodexConfig } from "../../adapter/activation/config.ts";
import { getActiveToolsInActiveOrder } from "../../adapter/active-tools.ts";
import { isProviderContextExcludedMessage } from "../../adapter/prompt/context-filter.ts";
import { getAgentDir } from "../../config.ts";
import type { ExtensionAPI, ExtensionContext } from "../../core/extensions/types.ts";
import { convertToLlm } from "../../core/messages.ts";
import { buildSessionContext } from "../../core/session-manager.ts";
import { SettingsManager } from "../../core/settings-manager.ts";

interface PrewarmUsage {
	inputTokens: number;
	cachedInputTokens: number;
	cacheWriteInputTokens: number;
}

type PrewarmOptions = SimpleStreamOptions & {
	executionMode?: "normal" | "code" | "notebook" | undefined;
	forceCachedWebSockets?: boolean | undefined;
	fast?: boolean | undefined;
	responsesCompaction?: boolean | undefined;
	textVerbosity?: string | undefined;
};

type Prewarm = (
	model: Model<Api>,
	context: Context,
	options: PrewarmOptions,
) => Promise<{ socketReused: boolean; usage?: PrewarmUsage | undefined } | undefined>;

const prewarmRegistryKey = Symbol.for("@earendil-works/pi-ai/openai-codex-prewarm");
const KEEPALIVE_INTERVAL_MS = 25 * 60 * 1_000;

async function loadPrewarm(): Promise<Prewarm | undefined> {
	const registry = (globalThis as typeof globalThis & { [key: symbol]: unknown })[prewarmRegistryKey];
	if (!registry || typeof registry !== "object" || !("load" in registry) || typeof registry.load !== "function")
		return undefined;
	return (await registry.load()) as Prewarm;
}

function loadConfig(ctx: ExtensionContext): CodexConversionConfig {
	const settings = SettingsManager.create(ctx.cwd, getAgentDir(), { projectTrusted: ctx.isProjectTrusted() });
	return resolveNativePiCodexConfig({
		settings: settings.getPiCodexSettings(),
		executionMode: settings.getExecutionMode(),
		notebook: settings.getNotebookSettings(),
	});
}

export function registerPiCodexCache(pi: ExtensionAPI): void {
	let controller: AbortController | undefined;
	let pending: Promise<unknown> | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let activeSystemPrompt: string | undefined;
	let consecutiveRedKeepalives = 0;
	let keepalivePaused = false;

	const isAbortError = (error: unknown) =>
		error instanceof Error && (error.name === "AbortError" || /aborted/i.test(error.message));

	const cancel = () => {
		controller?.abort();
		controller = undefined;
		if (timer) clearTimeout(timer);
		timer = undefined;
	};
	const prewarm = async (
		ctx: ExtensionContext,
		config: CodexConversionConfig,
		messages: Context["messages"],
	): Promise<{ socketReused: boolean; usage?: PrewarmUsage | undefined } | undefined> => {
		if (ctx.model?.api !== "openai-codex-responses" || !config.openai.forceCachedWebSockets) return undefined;
		const implementation = await loadPrewarm();
		if (!implementation || !ctx.model) return undefined;
		controller?.abort();
		const currentController = new AbortController();
		controller = currentController;
		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
		if (!auth.ok || !auth.apiKey || currentController.signal.aborted) return undefined;
		const model = auth.baseUrl ? { ...ctx.model, baseUrl: auth.baseUrl } : ctx.model;
		const thinkingLevel = pi.getThinkingLevel();
		try {
			return await implementation(
				model,
				{
					systemPrompt: activeSystemPrompt ?? ctx.getSystemPrompt(),
					messages,
					tools: getActiveToolsInActiveOrder(pi, config.executionMode !== "normal"),
				},
				{
					apiKey: auth.apiKey,
					...(auth.headers ? { headers: auth.headers } : {}),
					...(auth.env ? { env: auth.env } : {}),
					sessionId: ctx.sessionManager.getSessionId(),
					signal: currentController.signal,
					executionMode: config.executionMode,
					forceCachedWebSockets: config.openai.forceCachedWebSockets,
					fast: config.openai.fast,
					responsesCompaction: config.compaction.responsesCompaction,
					textVerbosity: config.openai.verbosity,
					...(thinkingLevel === "off" ? {} : { reasoning: thinkingLevel as PrewarmOptions["reasoning"] }),
				},
			);
		} finally {
			if (controller === currentController) controller = undefined;
		}
	};
	const currentMessages = (ctx: ExtensionContext): Context["messages"] =>
		convertToLlm(
			buildSessionContext(ctx.sessionManager.getBranch()).messages.filter(
				(message) => !isProviderContextExcludedMessage(message),
			),
		);
	const arm = (ctx: ExtensionContext, resetHealth = true) => {
		if (timer) clearTimeout(timer);
		if (resetHealth) {
			consecutiveRedKeepalives = 0;
			keepalivePaused = false;
		}
		const config = loadConfig(ctx);
		if (!config.openai.cacheKeepalive || keepalivePaused) return;
		timer = setTimeout(() => {
			timer = undefined;
			if (!ctx.isIdle()) return;
			pending = prewarm(ctx, config, currentMessages(ctx))
				.then((result) => {
					if (!result?.usage) {
						consecutiveRedKeepalives = 0;
						ctx.ui.notify("Codex cache keepalive completed without usage metrics", "warning");
						arm(ctx, false);
						return;
					}
					const usage = result.usage;
					const total = usage.inputTokens + usage.cachedInputTokens;
					const ratio = total > 0 ? usage.cachedInputTokens / total : undefined;
					if (ratio !== undefined && ratio <= 0.1) consecutiveRedKeepalives += 1;
					else consecutiveRedKeepalives = 0;
					ctx.ui.notify(
						`Codex cache keepalive · input ${usage.inputTokens.toLocaleString("en-US")} · read ${usage.cachedInputTokens.toLocaleString("en-US")} · write ${usage.cacheWriteInputTokens.toLocaleString("en-US")} · ${ratio === undefined ? "cache unavailable" : `${(ratio * 100).toFixed(1)}%`} · WS ${result.socketReused ? "reused" : "new"}`,
						ratio !== undefined && ratio <= 0.1
							? "error"
							: ratio !== undefined && ratio < 0.5
								? "warning"
								: "info",
					);
					if (consecutiveRedKeepalives >= 2) {
						keepalivePaused = true;
						ctx.ui.notify("Codex cache keepalive paused after two consecutive ≤10% reads", "error");
						return;
					}
					arm(ctx, false);
				})
				.catch((error: unknown) => {
					if (isAbortError(error)) return;
					ctx.ui.notify(
						`Codex cache keepalive failed: ${error instanceof Error ? error.message : String(error)}`,
						"warning",
					);
					arm(ctx, false);
				});
		}, KEEPALIVE_INTERVAL_MS);
		timer.unref?.();
	};

	pi.on("before_agent_start", async (event, ctx) => {
		activeSystemPrompt = event.systemPrompt;
		const operation = prewarm(ctx, loadConfig(ctx), []).catch((error: unknown) => {
			if (!isAbortError(error))
				ctx.ui.notify(
					`Codex cache prewarm failed: ${error instanceof Error ? error.message : String(error)}`,
					"warning",
				);
			return undefined;
		});
		pending = operation;
		await operation;
	});
	pi.on("agent_start", () => {
		if (timer) clearTimeout(timer);
		timer = undefined;
	});
	pi.on("agent_settled", (_event, ctx) => arm(ctx, true));
	pi.on("session_before_compact", () => cancel());
	pi.on("session_compact", (_event, ctx) => {
		pending = prewarm(ctx, loadConfig(ctx), currentMessages(ctx)).catch((error: unknown) => {
			if (!isAbortError(error))
				ctx.ui.notify(
					`Codex post-compaction prewarm failed: ${error instanceof Error ? error.message : String(error)}`,
					"warning",
				);
		});
	});
	pi.on("model_select", () => cancel());
	pi.on("session_shutdown", async () => {
		cancel();
		await pending?.catch(() => undefined);
		pending = undefined;
	});
}
