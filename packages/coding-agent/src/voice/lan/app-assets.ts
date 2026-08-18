import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Theme } from "../../modes/interactive/theme/theme.ts";
import { resolveLanVoiceWebTheme } from "./theme.ts";

export interface LanVoiceAppAsset {
	contentType: string;
	body: Buffer;
}

const ASSETS = {
	"/apple-touch-icon.png": ["apple-touch-icon.png", "image/png"],
	"/favicon.svg": ["gippity-icon.svg", "image/svg+xml"],
	"/icon-192.png": ["gippity-icon-192.png", "image/png"],
	"/icon-512.png": ["gippity-icon-512.png", "image/png"],
} as const;

const cache = new Map<keyof typeof ASSETS, Buffer>();
const packageRoot = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const assetsDirectory =
	[
		join(packageRoot, "src", "voice", "lan", "assets"),
		join(packageRoot, "dist", "voice", "lan", "assets"),
		join(dirname(process.execPath), "voice", "lan", "assets"),
	].find((directory) => existsSync(directory)) ?? join(packageRoot, "src", "voice", "lan", "assets");

export function getLanVoiceAppAsset(path: string): LanVoiceAppAsset | undefined {
	if (!(path in ASSETS)) return undefined;
	const assetPath = path as keyof typeof ASSETS;
	const [filename, contentType] = ASSETS[assetPath];
	let body = cache.get(assetPath);
	if (!body) {
		body = readFileSync(join(assetsDirectory, filename));
		cache.set(assetPath, body);
	}
	return { body, contentType };
}

export function createLanVoiceWebManifest(piTheme: Theme): string {
	const theme = resolveLanVoiceWebTheme(piTheme);
	return JSON.stringify({
		id: "/",
		name: "GipPity remote control",
		short_name: "GipPity",
		description: "Voice and message remote control for the active Pi session",
		start_url: "/",
		scope: "/",
		display: "standalone",
		background_color: theme.pageColor,
		theme_color: theme.pageColor,
		icons: [
			{ src: "/icon-192.png?v=2", sizes: "192x192", type: "image/png", purpose: "any" },
			{ src: "/icon-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "any maskable" },
		],
	});
}
