import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir, getStockPiAgentDir } from "../config.ts";
import type { Settings } from "../core/settings-manager.ts";

const MIGRATION_MARKER_BASENAME = ".pi-settings-migration-v1";

export type PiSettingsMigrationChoice = "import" | "fresh";

export interface PiSettingsMigrationPaths {
	sourceSettingsPath: string;
	targetSettingsPath: string;
	markerPath: string;
}

export function getPiSettingsMigrationPaths(
	targetAgentDir: string = getAgentDir(),
	stockPiAgentDir: string = getStockPiAgentDir(),
): PiSettingsMigrationPaths {
	return {
		sourceSettingsPath: join(stockPiAgentDir, "settings.json"),
		targetSettingsPath: join(targetAgentDir, "settings.json"),
		markerPath: join(targetAgentDir, MIGRATION_MARKER_BASENAME),
	};
}

export function shouldOfferPiSettingsMigration(paths: PiSettingsMigrationPaths): boolean {
	return (
		!existsSync(paths.targetSettingsPath) && !existsSync(paths.markerPath) && existsSync(paths.sourceSettingsPath)
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function copyString(
	source: Record<string, unknown>,
	target: Record<string, unknown>,
	key: string,
	allowed?: readonly string[],
): void {
	const value = source[key];
	if (typeof value === "string" && (!allowed || allowed.includes(value))) {
		target[key] = value;
	}
}

function copyBoolean(source: Record<string, unknown>, target: Record<string, unknown>, key: string): void {
	const value = source[key];
	if (typeof value === "boolean") {
		target[key] = value;
	}
}

function copyFiniteNumber(source: Record<string, unknown>, target: Record<string, unknown>, key: string): void {
	const value = source[key];
	if (typeof value === "number" && Number.isFinite(value)) {
		target[key] = value;
	}
}

function copyBuiltinTheme(source: Record<string, unknown>, target: Record<string, unknown>): void {
	const value = source.theme;
	if (typeof value !== "string") return;
	const names = value.split("/");
	if (names.length <= 2 && names.every((name) => name === "dark" || name === "light")) {
		target.theme = value;
	}
}

function copyObject(
	source: Record<string, unknown>,
	target: Record<string, unknown>,
	key: string,
	copy: (source: Record<string, unknown>, target: Record<string, unknown>) => void,
): void {
	const value = source[key];
	if (!isRecord(value)) return;
	const result: Record<string, unknown> = {};
	copy(value, result);
	if (Object.keys(result).length > 0) {
		target[key] = result;
	}
}

/**
 * Copy only provider-independent user preferences. Model, provider, tool,
 * package, extension, session, authentication, and fork-specific state is
 * deliberately excluded.
 */
export function extractCompatiblePiSettings(value: unknown): Settings {
	if (!isRecord(value)) {
		throw new Error("Stock Pi settings must contain a JSON object");
	}

	const compatible: Record<string, unknown> = {};
	copyString(value, compatible, "steeringMode", ["all", "one-at-a-time"]);
	if (compatible.steeringMode === undefined) {
		const legacyQueueMode = value.queueMode;
		if (legacyQueueMode === "all" || legacyQueueMode === "one-at-a-time") {
			compatible.steeringMode = legacyQueueMode;
		}
	}
	copyString(value, compatible, "followUpMode", ["all", "one-at-a-time"]);
	copyBuiltinTheme(value, compatible);
	copyString(value, compatible, "externalEditor");
	copyString(value, compatible, "shellPath");
	copyString(value, compatible, "doubleEscapeAction", ["fork", "tree", "none"]);
	copyString(value, compatible, "treeFilterMode", ["default", "no-tools", "user-only", "labeled-only", "all"]);
	copyString(value, compatible, "tuiMode", ["regular", "fullscreen"]);
	copyString(value, compatible, "fullscreenExitOutput", ["transcript", "resume-hint"]);
	copyString(value, compatible, "fullscreenScrollbar", ["auto", "always", "hidden"]);
	copyBoolean(value, compatible, "hideThinkingBlock");
	copyBoolean(value, compatible, "quietStartup");
	copyBoolean(value, compatible, "collapseChangelog");
	copyBoolean(value, compatible, "showHardwareCursor");
	copyFiniteNumber(value, compatible, "editorPaddingX");
	copyFiniteNumber(value, compatible, "outputPad");
	copyFiniteNumber(value, compatible, "autocompleteMaxVisible");

	copyObject(value, compatible, "terminal", (source, target) => {
		copyBoolean(source, target, "showImages");
		copyFiniteNumber(source, target, "imageWidthCells");
		copyBoolean(source, target, "clearOnShrink");
		copyBoolean(source, target, "showTerminalProgress");
	});
	copyObject(value, compatible, "images", (source, target) => {
		copyBoolean(source, target, "autoResize");
		copyBoolean(source, target, "blockImages");
	});
	copyObject(value, compatible, "markdown", (source, target) => {
		copyString(source, target, "codeBlockIndent");
		copyString(source, target, "mermaid", ["off", "final", "streaming"]);
	});

	return compatible as Settings;
}

function writeMarker(paths: PiSettingsMigrationPaths, choice: PiSettingsMigrationChoice): void {
	mkdirSync(dirname(paths.markerPath), { recursive: true, mode: 0o700 });
	writeFileSync(paths.markerPath, `${JSON.stringify({ choice, completedAt: new Date().toISOString() }, null, 2)}\n`, {
		encoding: "utf-8",
		flag: "wx",
		mode: 0o600,
	});
}

export function importCompatiblePiSettings(paths: PiSettingsMigrationPaths): Settings {
	const source = JSON.parse(readFileSync(paths.sourceSettingsPath, "utf-8")) as unknown;
	const settings = extractCompatiblePiSettings(source);
	mkdirSync(dirname(paths.targetSettingsPath), { recursive: true, mode: 0o700 });
	writeFileSync(paths.targetSettingsPath, `${JSON.stringify(settings, null, 2)}\n`, {
		encoding: "utf-8",
		flag: "wx",
		mode: 0o600,
	});
	writeMarker(paths, "import");
	return settings;
}

export function declinePiSettingsMigration(paths: PiSettingsMigrationPaths): void {
	writeMarker(paths, "fresh");
}
