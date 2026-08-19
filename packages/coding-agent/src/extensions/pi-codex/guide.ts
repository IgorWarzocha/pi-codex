import { join } from "node:path";
import { getDocsPath } from "../../config.ts";
import type { ExtensionAPI } from "../../core/extensions/types.ts";

export function getPiCodexGuidePath(): string {
	return join(getDocsPath(), "pi-codex-guide.md");
}

export function buildPiCodexGuidePrompt(focus: string, guidePath: string = getPiCodexGuidePath()): string {
	const requestedFocus = focus.trim();
	return [
		"Help me understand and set up this Pi-Codex fork.",
		`Read the Pi-Codex guide in full first: ${guidePath}`,
		"Start with the fork's differences from upstream Pi and the setup or migration steps relevant to this installation.",
		"Inspect current settings and resource directories read-only when useful. Do not copy, move, or modify anything unless I explicitly ask.",
		"After the guide, inspect other bundled Markdown or implementation files only as needed. Treat current Pi-Codex source as authoritative when inherited Pi documentation disagrees.",
		"Give concrete paths and commands, distinguish required setup from optional customization, and ask only pointed questions needed to choose a migration or configuration direction.",
		...(requestedFocus ? [`Requested focus: ${requestedFocus}`] : []),
	].join("\n");
}

export function registerPiCodexGuide(pi: ExtensionAPI): void {
	pi.registerCommand("pi-codex-guide", {
		description: "Explain Pi-Codex differences, setup, and migration",
		handler: async (args, ctx) => {
			const prompt = buildPiCodexGuidePrompt(args);
			if (ctx.isIdle()) {
				pi.sendUserMessage(prompt);
				return;
			}
			pi.sendUserMessage(prompt, { deliverAs: "followUp" });
			ctx.ui.notify("Pi-Codex guide queued as a follow-up", "info");
		},
	});
}
