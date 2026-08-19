import { Box, Text, truncateToWidth } from "@earendil-works/pi-tui";
import { findLatestCompactionEntry } from "../../adapter/compaction/details-store.ts";
import {
	isNativeCompactionDetails,
	NATIVE_COMPACTION_DISPLAY_MESSAGE_TYPE,
	NATIVE_COMPACTION_DISPLAY_TEXT,
	NATIVE_COMPACTION_STRATEGY,
	type NativeCompactionDisplayEntry,
} from "../../adapter/compaction/types.ts";
import type { ExtensionAPI } from "../../core/extensions/types.ts";

export function registerPiCodexCompaction(pi: ExtensionAPI): void {
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

	pi.on("session_compact", (_event, ctx) => {
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
