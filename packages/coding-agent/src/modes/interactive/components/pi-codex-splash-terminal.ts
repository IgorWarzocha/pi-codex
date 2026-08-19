import { Buffer } from "node:buffer";
import {
	PI_CODEX_SPLASH_PIXEL_HEIGHT,
	PI_CODEX_SPLASH_PIXEL_WIDTH,
	PI_CODEX_SPLASH_PIXELS_BASE64,
} from "./pi-codex-splash-pixels.generated.ts";

const OPAQUE_ALPHA = 128;

function pixelAt(pixels: Uint8Array, x: number, y: number): [number, number, number, number] {
	const offset = (y * PI_CODEX_SPLASH_PIXEL_WIDTH + x) * 4;
	return [pixels[offset]!, pixels[offset + 1]!, pixels[offset + 2]!, pixels[offset + 3]!];
}

function foreground([red, green, blue]: [number, number, number, number]): string {
	return `\u001B[38;2;${red};${green};${blue}m`;
}

function foregroundBackground(
	[foregroundRed, foregroundGreen, foregroundBlue]: [number, number, number, number],
	[backgroundRed, backgroundGreen, backgroundBlue]: [number, number, number, number],
): string {
	return `\u001B[38;2;${foregroundRed};${foregroundGreen};${foregroundBlue};48;2;${backgroundRed};${backgroundGreen};${backgroundBlue}m`;
}

/** Render the Pi-Codex duo using terminal half blocks when inline images are unavailable. */
export function renderPiCodexTerminalSplash(): string {
	const pixels = Buffer.from(PI_CODEX_SPLASH_PIXELS_BASE64, "base64");
	const lines: string[] = [];

	for (let y = 0; y < PI_CODEX_SPLASH_PIXEL_HEIGHT; y += 2) {
		let line = "";
		for (let x = 0; x < PI_CODEX_SPLASH_PIXEL_WIDTH; x++) {
			const top = pixelAt(pixels, x, y);
			const bottom = pixelAt(pixels, x, y + 1);
			const topVisible = top[3] >= OPAQUE_ALPHA;
			const bottomVisible = bottom[3] >= OPAQUE_ALPHA;
			if (topVisible && bottomVisible) {
				line += `${foregroundBackground(top, bottom)}▀\u001B[0m`;
			} else if (topVisible) {
				line += `${foreground(top)}▀\u001B[0m`;
			} else if (bottomVisible) {
				line += `${foreground(bottom)}▄\u001B[0m`;
			} else {
				line += " ";
			}
		}
		lines.push(line);
	}

	return lines.join("\n");
}
