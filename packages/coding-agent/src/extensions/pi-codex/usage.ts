import { resolveNativePiCodexConfig } from "../../adapter/activation/config.ts";
import { buildStatusText, STATUS_KEY } from "../../adapter/activation/tool-set.ts";
import {
	consumeCodexRateLimitResetCredit,
	fetchCodexUsage,
	fetchCodexWeeklyUsageLeft,
} from "../../codex-usage/client.ts";
import { formatCodexUsage } from "../../codex-usage/format.ts";
import { getAgentDir } from "../../config.ts";
import type { ExtensionAPI, ExtensionContext } from "../../core/extensions/types.ts";
import { SettingsManager } from "../../core/settings-manager.ts";

function formatResetOutcome(outcome: Awaited<ReturnType<typeof consumeCodexRateLimitResetCredit>>): string {
	if (outcome.outcome === "reset") return "Codex rate limits reset.";
	if (outcome.outcome === "already_redeemed") return "Reset already applied.";
	if (outcome.outcome === "nothing_to_reset") return "No active Codex limit to reset.";
	if (outcome.outcome === "no_credit") return "No banked resets available.";
	return "Reset response was not recognized.";
}

export function registerPiCodexUsage(pi: ExtensionAPI): void {
	let generation = 0;
	const refreshStatus = async (ctx: ExtensionContext) => {
		const currentGeneration = ++generation;
		const settings = SettingsManager.create(ctx.cwd, getAgentDir(), { projectTrusted: ctx.isProjectTrusted() });
		const config = resolveNativePiCodexConfig({
			settings: settings.getPiCodexSettings(),
			executionMode: settings.getExecutionMode(),
			notebook: settings.getNotebookSettings(),
		});
		if (!config.ui.statusLine || ctx.model?.provider !== "openai-codex") {
			ctx.ui.setStatus(STATUS_KEY, undefined);
			return;
		}
		const weeklyUsageLeft = await fetchCodexWeeklyUsageLeft(ctx);
		if (currentGeneration !== generation) return;
		ctx.ui.setStatus(
			STATUS_KEY,
			buildStatusText(
				{
					mode: config.executionMode,
					verbosity: config.openai.verbosity,
					webSearch: config.tools.webRun,
					imageGeneration: config.tools.imageGeneration,
					fast: config.openai.fast,
					useOnAllModels: false,
					compaction: config.compaction.responsesCompaction,
					weeklyUsageLeft,
				},
				ctx.ui.theme,
			),
		);
	};

	pi.registerCommand("usage", {
		description: "Show Codex limits or consume a banked reset",
		getArgumentCompletions: (prefix) =>
			["refresh", "reset"]
				.filter((value) => value.startsWith(prefix.trim().toLowerCase()))
				.map((value) => ({ label: value, value })),
		handler: async (args, ctx) => {
			const action = args.trim().toLowerCase();
			try {
				if (action === "reset") {
					ctx.ui.notify(formatResetOutcome(await consumeCodexRateLimitResetCredit(ctx)), "info");
				}
				ctx.ui.notify(formatCodexUsage(await fetchCodexUsage(ctx)), "info");
				void refreshStatus(ctx);
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			}
		},
	});
	pi.on("session_start", (_event, ctx) => void refreshStatus(ctx));
	pi.on("model_select", (_event, ctx) => void refreshStatus(ctx));
	pi.on("agent_settled", (_event, ctx) => void refreshStatus(ctx));
	pi.on("session_shutdown", (_event, ctx) => {
		generation += 1;
		ctx.ui.setStatus(STATUS_KEY, undefined);
	});
}
