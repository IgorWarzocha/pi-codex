import { resetCapabilitiesCache, setCapabilities, visibleWidth } from "@earendil-works/pi-tui";
import { afterEach, describe, expect, it } from "vitest";
import { PiCodexSplashComponent } from "../src/modes/interactive/components/pi-codex-splash.ts";
import { renderPiCodexTerminalSplash } from "../src/modes/interactive/components/pi-codex-splash-terminal.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";

afterEach(() => resetCapabilitiesCache());

describe("Pi-Codex startup splash", () => {
	it("keeps a text identity and guide path when terminal images are unavailable", () => {
		setCapabilities({ images: null, trueColor: false, hyperlinks: false });
		initTheme("dark");
		const splash = new PiCodexSplashComponent();
		const rendered = splash.render(80).join("\n");

		expect(rendered).toContain("Pi × Codex");
		expect(rendered).toContain("/pi-codex-guide");
	});

	it("renders the duo as compact truecolor half blocks without inline-image support", () => {
		setCapabilities({ images: null, trueColor: true, hyperlinks: false });
		initTheme("dark");
		const splash = new PiCodexSplashComponent();
		const lines = splash.render(80);

		expect(renderPiCodexTerminalSplash().split("\n")).toHaveLength(12);
		expect(lines.filter((line) => line.includes("▀") || line.includes("▄")).length).toBeGreaterThan(0);
		expect(lines.some((line) => line.includes("\u001B[38;2;"))).toBe(true);
		expect(lines.every((line) => visibleWidth(line) <= 80)).toBe(true);
	});
});
