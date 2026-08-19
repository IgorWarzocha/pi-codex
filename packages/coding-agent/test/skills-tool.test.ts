import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Skill } from "../src/core/skills.ts";
import { createSyntheticSourceInfo } from "../src/core/source-info.ts";
import { createSkillsCodeModeTool, runSkillsCommand } from "../src/tools/code-mode/skills-tool.ts";

describe("native skills tool", () => {
	let tempDir: string;
	let eager: Skill;
	let lazy: Skill;

	beforeEach(() => {
		tempDir = join(tmpdir(), `pi-skills-tool-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		const eagerDir = join(tempDir, "deploy");
		const lazyDir = join(tempDir, "swe", "hardening");
		mkdirSync(join(eagerDir, "scripts"), { recursive: true });
		mkdirSync(lazyDir, { recursive: true });
		const eagerPath = join(eagerDir, "SKILL.md");
		const lazyPath = join(lazyDir, "SKILL.md");
		writeFileSync(eagerPath, "---\nname: deploy\ndescription: Deploy safely\n---\nDeploy body");
		writeFileSync(join(eagerDir, "scripts", "run.sh"), "exit 0");
		writeFileSync(lazyPath, "---\nname: hardening\ndescription: Harden code\n---\nHardening body");
		eager = {
			name: "deploy",
			description: "Deploy safely",
			filePath: eagerPath,
			baseDir: eagerDir,
			sourceInfo: createSyntheticSourceInfo(eagerPath, { source: "test" }),
			disableModelInvocation: false,
		};
		lazy = {
			name: "hardening",
			description: "Harden code",
			filePath: lazyPath,
			baseDir: lazyDir,
			category: "swe",
			sourceInfo: createSyntheticSourceInfo(lazyPath, { source: "test" }),
			disableModelInvocation: false,
		};
	});

	afterEach(() => rmSync(tempDir, { recursive: true, force: true }));

	it("lists eager and categorized skills, with optional category filtering", () => {
		expect(runSkillsCommand("list", [eager, lazy])).toContain("# IMPORTANT\n- deploy: Deploy safely");
		expect(runSkillsCommand("list", [eager, lazy])).toContain("# SWE\n- hardening: Harden code");
		expect(runSkillsCommand("list swe", [eager, lazy])).toBe("# SWE\n- hardening: Harden code");
	});

	it("reads either kind and returns safe absolute package paths", () => {
		const outside = join(tempDir, "outside.txt");
		writeFileSync(outside, "outside");
		symlinkSync(outside, join(eager.baseDir, "outside-link"));

		const result = runSkillsCommand("read deploy", [eager, lazy]);
		expect(result).toContain("Deploy body");
		expect(result).toContain(eager.filePath);
		expect(result).toContain(join(eager.baseDir, "scripts", "run.sh"));
		expect(result).not.toContain(join(eager.baseDir, "outside-link"));
	});

	it("rescans immediately before composed invocations", async () => {
		let refreshes = 0;
		const options = {
			getSkills: () => [eager, lazy],
			refreshSkills: async () => {
				refreshes++;
			},
		};
		const tool = createSkillsCodeModeTool(options);

		const result = await tool.invoke("read hardening", { cwd: tempDir }, new AbortController().signal);
		expect(result).toContain("Hardening body");
		expect(refreshes).toBe(1);
	});
});
