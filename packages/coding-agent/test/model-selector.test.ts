import { setKeybindings } from "@earendil-works/pi-tui";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { KeybindingsManager } from "../src/core/keybindings.ts";
import type { ModelProfile } from "../src/core/model-profile.ts";
import { ModelSelectorComponent } from "../src/modes/interactive/components/model-selector.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";
import { stripAnsi } from "../src/utils/ansi.ts";
import { createHarness, type Harness } from "./suite/harness.ts";

describe("model profile selector", () => {
	let harness: Harness | undefined;

	beforeAll(() => {
		initTheme("dark");
	});

	beforeEach(() => {
		setKeybindings(new KeybindingsManager());
	});

	afterEach(() => {
		harness?.cleanup();
		harness = undefined;
	});

	it("renders the three Pi-Codex profile columns and applies them atomically", async () => {
		harness = await createHarness({
			models: [
				{ id: "gpt-5.6-luna", name: "Luna", reasoning: true },
				{ id: "gpt-5.6-terra", name: "Terra", reasoning: true },
				{ id: "gpt-5.6-sol", name: "Sol", reasoning: true },
			],
		});
		const selected = vi.fn<(profile: ModelProfile) => void>();
		const selector = new ModelSelectorComponent(harness.getModel("gpt-5.6-luna"), "high", harness.models, [], {
			onSelect: selected,
			onSave: () => "saved",
			onCancel: () => {},
		});

		const rendered = stripAnsi(selector.render(100).join("\n"));
		expect(rendered).toContain("Model");
		expect(rendered).toContain("Context");
		expect(rendered).toContain("Reasoning");
		expect(rendered).toContain("Luna");
		expect(rendered).toContain("Terra");
		expect(rendered).toContain("Sol");
		expect(rendered).toContain("272k");
		expect(rendered).toContain("472k");
		expect(rendered).toContain("872k");
		expect(rendered).toContain("medium");
		expect(rendered).toContain("max");

		selector.handleInput("\x1b[B");
		selector.handleInput("\x1b[C");
		selector.handleInput("\x1b[B");
		selector.handleInput("\x1b[C");
		selector.handleInput("\x1b[A");
		selector.handleInput("\r");

		expect(selected).toHaveBeenCalledWith({
			model: expect.objectContaining({ id: "gpt-5.6-terra" }),
			contextWindow: 472_000,
			thinkingLevel: "medium",
		});
	});

	it("toggles the selected profile through the save callback", async () => {
		harness = await createHarness({ models: [{ id: "gpt-5.6-luna", name: "Luna", reasoning: true }] });
		const save = vi.fn<(profile: ModelProfile) => "saved" | "removed">(() => "saved");
		const selector = new ModelSelectorComponent(harness.getModel("gpt-5.6-luna"), "medium", harness.models, [], {
			onSelect: () => {},
			onSave: save,
			onCancel: () => {},
		});

		selector.handleInput("\x13");

		expect(save).toHaveBeenCalledWith({
			model: expect.objectContaining({ id: "gpt-5.6-luna" }),
			contextWindow: 272_000,
			thinkingLevel: "medium",
		});
		expect(stripAnsi(selector.render(100).join("\n"))).toContain("Profile saved for model cycling.");
	});
});
