import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionCommandContext, RegisteredCommand } from "../src/core/extensions/types.ts";
import { buildPiCodexGuidePrompt, registerPiCodexGuide } from "../src/extensions/pi-codex/guide.ts";

describe("Pi-Codex guide command", () => {
	it("builds a source-aware setup prompt", () => {
		const prompt = buildPiCodexGuidePrompt("categorise my skills", "/package/docs/pi-codex-guide.md");

		expect(prompt).toContain("Read the Pi-Codex guide in full first: /package/docs/pi-codex-guide.md");
		expect(prompt).toContain("differences from upstream Pi");
		expect(prompt).toContain("Treat current Pi-Codex source as authoritative");
		expect(prompt).toContain("Requested focus: categorise my skills");
	});

	it("registers an agent-triggering command", async () => {
		let command: Omit<RegisteredCommand, "name" | "sourceInfo"> | undefined;
		const sendUserMessage = vi.fn();
		const pi = {
			registerCommand: (name: string, options: Omit<RegisteredCommand, "name" | "sourceInfo">) => {
				expect(name).toBe("pi-codex-guide");
				command = options;
			},
			sendUserMessage,
		} as unknown as ExtensionAPI;
		registerPiCodexGuide(pi);

		await command?.handler("skills", { isIdle: () => true } as unknown as ExtensionCommandContext);

		expect(sendUserMessage).toHaveBeenCalledOnce();
		expect(sendUserMessage).toHaveBeenCalledWith(expect.stringContaining("Requested focus: skills"));
	});
});
