import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	declinePiSettingsMigration,
	extractCompatiblePiSettings,
	getPiSettingsMigrationPaths,
	importCompatiblePiSettings,
	shouldOfferPiSettingsMigration,
} from "../src/cli/pi-settings-migration.ts";

describe("Pi settings migration", () => {
	let root: string;
	let stockAgentDir: string;
	let codexAgentDir: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "pi-settings-migration-"));
		stockAgentDir = join(root, ".pi", "agent");
		codexAgentDir = join(root, ".pi-codex", "agent");
		mkdirSync(stockAgentDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it("copies only provider-independent preferences", () => {
		const migrated = extractCompatiblePiSettings({
			theme: "dark",
			steeringMode: "all",
			externalEditor: "nvim",
			terminal: { showImages: false, imageWidthCells: 72, unknown: true },
			images: { autoResize: false },
			markdown: { mermaid: "final" },
			defaultProvider: "anthropic",
			defaultModel: "claude",
			sessionDir: "/shared/sessions",
			packages: ["npm:example"],
			extensions: ["extension.ts"],
			piCodex: { openai: { fast: true } },
		});

		expect(migrated).toEqual({
			theme: "dark",
			steeringMode: "all",
			externalEditor: "nvim",
			terminal: { showImages: false, imageWidthCells: 72 },
			images: { autoResize: false },
			markdown: { mermaid: "final" },
		});
	});

	it("does not import a custom theme without its separate theme package", () => {
		expect(extractCompatiblePiSettings({ theme: "custom-theme" })).toEqual({});
		expect(extractCompatiblePiSettings({ theme: "light/dark" })).toEqual({ theme: "light/dark" });
	});

	it("offers once when stock settings exist and Pi-Codex has no decision", () => {
		const paths = getPiSettingsMigrationPaths(codexAgentDir, stockAgentDir);
		writeFileSync(paths.sourceSettingsPath, "{}", "utf-8");

		expect(shouldOfferPiSettingsMigration(paths)).toBe(true);
		declinePiSettingsMigration(paths);
		expect(shouldOfferPiSettingsMigration(paths)).toBe(false);
		expect(existsSync(paths.targetSettingsPath)).toBe(false);
		expect(JSON.parse(readFileSync(paths.markerPath, "utf-8"))).toMatchObject({ choice: "fresh" });
	});

	it("writes compatible settings without copying the source file wholesale", () => {
		const paths = getPiSettingsMigrationPaths(codexAgentDir, stockAgentDir);
		writeFileSync(
			paths.sourceSettingsPath,
			JSON.stringify({ theme: "light", outputPad: 0, auth: { openai: "secret" }, defaultModel: "other" }),
			"utf-8",
		);

		const imported = importCompatiblePiSettings(paths);

		expect(imported).toEqual({ theme: "light", outputPad: 0 });
		expect(JSON.parse(readFileSync(paths.targetSettingsPath, "utf-8"))).toEqual(imported);
		expect(JSON.parse(readFileSync(paths.markerPath, "utf-8"))).toMatchObject({ choice: "import" });
		expect(shouldOfferPiSettingsMigration(paths)).toBe(false);
	});

	it("does not overwrite an existing Pi-Codex settings file", () => {
		const paths = getPiSettingsMigrationPaths(codexAgentDir, stockAgentDir);
		writeFileSync(paths.sourceSettingsPath, JSON.stringify({ theme: "light" }), "utf-8");
		mkdirSync(codexAgentDir, { recursive: true });
		writeFileSync(paths.targetSettingsPath, JSON.stringify({ theme: "dark" }), "utf-8");

		expect(shouldOfferPiSettingsMigration(paths)).toBe(false);
		expect(() => importCompatiblePiSettings(paths)).toThrow();
		expect(JSON.parse(readFileSync(paths.targetSettingsPath, "utf-8"))).toEqual({ theme: "dark" });
	});
});
