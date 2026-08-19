import { readFileSync } from "node:fs";
import { type Component, Container, getCapabilities, Image, Spacer, visibleWidth } from "@earendil-works/pi-tui";
import { getBundledInteractiveAssetPath } from "../../../config.ts";
import { theme } from "../theme/theme.ts";
import { renderPiCodexTerminalSplash } from "./pi-codex-splash-terminal.ts";

export const PI_CODEX_SPLASH_ART_FILENAME = "pi-codex-duo.png";

class CenteredText implements Component {
	private readonly value: string;
	private readonly narrowFallback: string;

	constructor(value: string, narrowFallback: string = value) {
		this.value = value;
		this.narrowFallback = narrowFallback;
	}

	invalidate(): void {}

	render(width: number): string[] {
		const lines = this.value.split("\n");
		if (lines.some((line) => visibleWidth(line) > width)) {
			return [center(this.narrowFallback, width)];
		}
		return lines.map((line) => center(line, width));
	}
}

function center(text: string, width: number): string {
	return " ".repeat(Math.max(0, Math.floor((width - visibleWidth(text)) / 2))) + text;
}

let imageBase64: string | undefined;
let attemptedImageLoad = false;

function loadImageBase64(): string | undefined {
	if (attemptedImageLoad) return imageBase64;

	attemptedImageLoad = true;
	try {
		imageBase64 = readFileSync(getBundledInteractiveAssetPath(PI_CODEX_SPLASH_ART_FILENAME)).toString("base64");
	} catch {
		imageBase64 = undefined;
	}
	return imageBase64;
}

export class PiCodexSplashComponent extends Container {
	constructor() {
		super();

		const art = loadImageBase64();
		const capabilities = getCapabilities();
		if (art && capabilities.images) {
			this.addChild(
				new Image(
					art,
					"image/png",
					{ fallbackColor: (text) => theme.fg("muted", text) },
					{
						maxWidthCells: 44,
						maxHeightCells: 12,
						horizontalAlign: "center",
						filename: PI_CODEX_SPLASH_ART_FILENAME,
					},
				),
			);
		} else if (capabilities.trueColor) {
			this.addChild(new CenteredText(renderPiCodexTerminalSplash(), theme.bold(theme.fg("accent", "Pi × Codex"))));
		} else {
			this.addChild(new CenteredText(theme.bold(theme.fg("accent", "Pi × Codex"))));
		}

		this.addChild(new Spacer(1));
		this.addChild(new CenteredText(theme.fg("dim", "Run /pi-codex-guide for setup and migration.")));
	}
}
