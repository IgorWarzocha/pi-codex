import { setKeybindings } from "@earendil-works/pi-tui";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { KeybindingsManager } from "../src/core/keybindings.ts";
import {
	type SettingsCallbacks,
	type SettingsConfig,
	SettingsSelectorComponent,
} from "../src/modes/interactive/components/settings-selector.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";

describe("SettingsSelectorComponent", () => {
	beforeAll(() => {
		initTheme("dark");
		setKeybindings(new KeybindingsManager());
	});

	function config(): SettingsConfig {
		return {
			autoCompact: true,
			showImages: false,
			imageWidthCells: 80,
			autoResizeImages: true,
			blockImages: false,
			enableSkillCommands: true,
			steeringMode: "one-at-a-time",
			followUpMode: "one-at-a-time",
			transport: "auto",
			executionMode: "code",
			piCodex: {},
			httpIdleTimeoutMs: 300_000,
			thinkingLevel: "low",
			currentTheme: "dark",
			terminalTheme: "dark",
			hideThinkingBlock: false,
			mermaidRenderingMode: "off",
			showCacheMissNotices: false,
			collapseChangelog: false,
			enableInstallTelemetry: false,
			doubleEscapeAction: "tree",
			treeFilterMode: "default",
			showHardwareCursor: false,
			editorPaddingX: 0,
			outputPad: 1,
			autocompleteMaxVisible: 5,
			quietStartup: false,
			warnings: {},
			availableThinkingLevels: ["low"],
			availableThemes: ["dark"],
			defaultProjectTrust: "ask",
			clearOnShrink: false,
			showTerminalProgress: false,
			tuiMode: "regular",
			fullscreenExitOutput: "transcript",
			fullscreenScrollbar: "auto",
		};
	}

	it("groups settings into guided tabs", () => {
		const selector = new SettingsSelectorComponent(config(), {} as SettingsCallbacks);
		const general = selector.render(120).join("\n");

		expect(general).toContain("General");
		expect(general).toContain("Codex");
		expect(general).toContain("Agent behavior, tool execution, reasoning, and session navigation.");
		expect(general).toContain("Execution mode");
		expect(general).not.toContain("Fast mode");

		selector.handleInput("\t");
		const codex = selector.render(120).join("\n");
		expect(selector.getActiveTabId()).toBe("codex");
		expect(codex).toContain("OpenAI request behavior, context compaction, and prompt-cache continuity.");
		expect(codex).toContain("Fast mode");
		expect(codex).not.toContain("Execution mode");
	});

	it("keeps the main settings frame at a stable height", () => {
		const selector = new SettingsSelectorComponent(config(), {} as SettingsCallbacks);
		const heights: number[] = [];

		for (let index = 0; index < 6; index += 1) {
			heights.push(selector.render(80).length);
			selector.handleInput("\t");
		}

		expect(new Set(heights)).toEqual(new Set([18]));
	});

	it("keeps tab navigation inside an open setting submenu", () => {
		const selector = new SettingsSelectorComponent(config(), {} as SettingsCallbacks);
		selector.handleInput("\x1b[B");
		selector.handleInput("\r");

		selector.handleInput("\t");
		expect(selector.getActiveTabId()).toBe("general");

		selector.handleInput("\x1b");
		selector.handleInput("\t");
		expect(selector.getActiveTabId()).toBe("codex");
	});

	it("cycles through fullscreen settings", () => {
		const onExitOutputChange = vi.fn();
		const onScrollbarChange = vi.fn();
		const callbacks = {
			onFullscreenExitOutputChange: onExitOutputChange,
			onFullscreenScrollbarChange: onScrollbarChange,
		} as unknown as SettingsCallbacks;

		const cycle = (down: number, count: number) => {
			const selector = new SettingsSelectorComponent(config(), callbacks);
			for (let i = 0; i < 4; i++) selector.handleInput("\t");
			for (let i = 0; i < down; i++) selector.handleInput("\x1b[B");
			for (let i = 0; i < count; i++) selector.handleInput("\r");
		};

		cycle(1, 2);
		expect(onExitOutputChange.mock.calls.flat()).toEqual(["resume-hint", "transcript"]);
		cycle(2, 3);
		expect(onScrollbarChange.mock.calls.flat()).toEqual(["always", "hidden", "auto"]);
	});

	it("configures the native voice context model", () => {
		const onPiCodexChange = vi.fn();
		const selector = new SettingsSelectorComponent(config(), {
			onPiCodexChange,
		} as unknown as SettingsCallbacks);

		selector.handleInput("\t");
		selector.handleInput("\t");
		for (let i = 0; i < 5; i++) selector.handleInput("\x1b[B");
		selector.handleInput("\r");

		expect(onPiCodexChange).toHaveBeenLastCalledWith({
			voice: { contextModel: { provider: "openai-codex", modelId: "gpt-5.6-luna" } },
		});
	});
});
