import { Box, Text, truncateToWidth } from "@earendil-works/pi-tui";
import { resolveNativePiCodexConfig } from "../../adapter/activation/config.ts";
import {
	handleCodexSessionBeforeCompact,
	injectPendingNativeWindowIntoPiCompactionRequest,
	type NativeCompactionState,
	rewriteCodexCompactedProviderRequest,
} from "../../adapter/compaction/compaction.ts";
import { findLatestCompactionEntry } from "../../adapter/compaction/details-store.ts";
import {
	isNativeCompactionDetails,
	NATIVE_COMPACTION_DISPLAY_MESSAGE_TYPE,
	NATIVE_COMPACTION_DISPLAY_TEXT,
	NATIVE_COMPACTION_STRATEGY,
	type NativeCompactionDisplayEntry,
} from "../../adapter/compaction/types.ts";
import { getAgentDir } from "../../config.ts";
import type { ExtensionAPI, ExtensionContext } from "../../core/extensions/types.ts";
import { SettingsManager } from "../../core/settings-manager.ts";

function configFor(ctx: ExtensionContext) {
	const settings = SettingsManager.create(ctx.cwd, getAgentDir(), { projectTrusted: ctx.isProjectTrusted() });
	return resolveNativePiCodexConfig({
		settings: settings.getPiCodexSettings(),
		executionMode: settings.getExecutionMode(),
		notebook: settings.getNotebookSettings(),
	});
}

export function registerPiCodexCompaction(pi: ExtensionAPI): void {
	const state: NativeCompactionState = {
		config: resolveNativePiCodexConfig({
			settings: {},
			executionMode: "code",
			notebook: { maxHeapMiB: 4_096 },
		}),
		executionMode: "code",
	};
	const refresh = (ctx: ExtensionContext) => {
		state.config = configFor(ctx);
		state.executionMode = state.config.executionMode;
	};

	const render = (
		content: string,
		kind: NativeCompactionDisplayEntry["kind"],
		theme: Parameters<Parameters<ExtensionAPI["registerEntryRenderer"]>[1]>[2],
	) => {
		if (kind === "usage") return new Text(theme.fg("dim", `  ${content}`), 0, 0);
		const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));
		box.addChild(new Text(theme.fg("customMessageLabel", theme.bold("[compaction]")), 0, 0));
		box.addChild(new Text(`\n${theme.fg("customMessageText", content)}`, 0, 0));
		const baseRender = box.render.bind(box);
		box.render = (width) => baseRender(width).map((line) => truncateToWidth(line, width, ""));
		return box;
	};
	pi.registerMessageRenderer<{ kind?: "usage" | undefined }>(
		NATIVE_COMPACTION_DISPLAY_MESSAGE_TYPE,
		(message, _options, theme) =>
			render(
				typeof message.content === "string" ? message.content : NATIVE_COMPACTION_DISPLAY_TEXT,
				message.details?.kind,
				theme,
			),
	);
	pi.registerEntryRenderer<NativeCompactionDisplayEntry>(
		NATIVE_COMPACTION_DISPLAY_MESSAGE_TYPE,
		(entry, _options, theme) =>
			render(
				typeof entry.data?.content === "string" ? entry.data.content : NATIVE_COMPACTION_DISPLAY_TEXT,
				entry.data?.kind,
				theme,
			),
	);

	pi.on("session_start", (_event, ctx) => refresh(ctx));
	pi.on("model_select", (_event, ctx) => refresh(ctx));
	pi.on("before_agent_start", (event, ctx) => {
		refresh(ctx);
		state.activeProviderSystemPrompt = event.systemPrompt;
	});
	pi.on("session_before_compact", (event, ctx) => {
		refresh(ctx);
		return handleCodexSessionBeforeCompact(event, ctx, state, pi);
	});
	pi.on("before_provider_request", async (event, ctx) => {
		refresh(ctx);
		const fallback = await injectPendingNativeWindowIntoPiCompactionRequest(event.payload, ctx, state);
		return fallback ?? (await rewriteCodexCompactedProviderRequest(event.payload, ctx, state));
	});
	pi.on("session_compact", (_event, ctx) => {
		state.pendingPiCompactionNativeWindow = undefined;
		const entry = findLatestCompactionEntry(ctx.sessionManager.getBranch());
		if (!entry || !isNativeCompactionDetails(entry.details)) return;
		const details = entry.details;
		pi.appendEntry<NativeCompactionDisplayEntry>(NATIVE_COMPACTION_DISPLAY_MESSAGE_TYPE, {
			content: NATIVE_COMPACTION_DISPLAY_TEXT,
			compactionEntryId: entry.id,
		});
		if (details.strategy !== NATIVE_COMPACTION_STRATEGY || !details.usage) return;
		const usage = details.usage;
		const tokens = (value: number) => Math.round(value).toLocaleString("en-US");
		const ratio =
			usage.inputTokens > 0 ? `${((usage.cachedInputTokens / usage.inputTokens) * 100).toFixed(1)}%` : "0%";
		pi.appendEntry<NativeCompactionDisplayEntry>(NATIVE_COMPACTION_DISPLAY_MESSAGE_TYPE, {
			content: `Compaction V2 · input ${tokens(usage.inputTokens)} · cache read ${tokens(usage.cachedInputTokens)} (${ratio}) · cache write ${tokens(usage.cacheWriteInputTokens)} · output ${tokens(usage.outputTokens)}`,
			compactionEntryId: entry.id,
			kind: "usage",
		});
	});
}
