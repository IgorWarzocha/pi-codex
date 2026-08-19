import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadExtensions } from "../src/core/extensions/loader.ts";

describe("Pi-Codex extension policy", () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		for (const directory of tempDirs.splice(0)) {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	function createTempDir(): string {
		const directory = mkdtempSync(join(tmpdir(), "pi-codex-extension-policy-"));
		tempDirs.push(directory);
		return directory;
	}

	it("silently skips the retired conversion package without reading the module", async () => {
		const cwd = createTempDir();
		const entryPath = join(cwd, "node_modules", "@howaboua", "pi-codex-conversion", "dist", "index.js");
		mkdirSync(dirname(entryPath), { recursive: true });
		writeFileSync(entryPath, `throw new Error("retired extension executed");`);

		const result = await loadExtensions([entryPath], cwd);

		expect(result.extensions).toEqual([]);
		expect(result.errors).toEqual([]);
	});

	it("continues loading unrelated extensions", async () => {
		const cwd = createTempDir();
		const packageDir = join(cwd, "pi-codex-conversion-helper");
		const entryPath = join(packageDir, "index.js");
		mkdirSync(packageDir, { recursive: true });
		writeFileSync(join(packageDir, "package.json"), JSON.stringify({ name: "pi-codex-conversion-helper" }));
		writeFileSync(entryPath, `export default function (pi) { pi.registerCommand("loaded", { handler() {} }); }`);

		const result = await loadExtensions([entryPath], cwd);

		expect(result.errors).toEqual([]);
		expect(result.extensions).toHaveLength(1);
		expect(result.extensions[0]?.commands.has("loaded")).toBe(true);
	});
});
