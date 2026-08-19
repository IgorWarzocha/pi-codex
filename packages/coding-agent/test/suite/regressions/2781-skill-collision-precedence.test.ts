import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DefaultResourceLoader } from "../../../src/core/resource-loader.ts";

describe("issue #2781 skill collision handling", () => {
	let tempDir: string;
	let agentDir: string;
	let cwd: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `pi-2781-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		cwd = join(tempDir, "project");
		mkdirSync(agentDir, { recursive: true });
		mkdirSync(cwd, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	function createPackageWithSkill(name: string, description: string): string {
		const pkgDir = join(tempDir, `fake-package-${name}`);
		const skillDir = join(pkgDir, "skills", name);
		mkdirSync(skillDir, { recursive: true });
		writeFileSync(
			join(pkgDir, "package.json"),
			JSON.stringify({ name: `fake-pkg-${name}`, version: "1.0.0", pi: { skills: [`skills/${name}`] } }, null, 2),
		);
		writeFileSync(
			join(skillDir, "SKILL.md"),
			`---\nname: ${name}\ndescription: ${description}\n---\nPackage skill content`,
		);
		return pkgDir;
	}

	function createUserSkill(name: string, description: string): string {
		const skillDir = join(agentDir, "skills", name);
		mkdirSync(skillDir, { recursive: true });
		const skillPath = join(skillDir, "SKILL.md");
		writeFileSync(skillPath, `---\nname: ${name}\ndescription: ${description}\n---\nUser skill content`);
		return skillPath;
	}

	function createProjectSkill(name: string, description: string): string {
		const skillDir = join(cwd, ".pi", "skills", name);
		mkdirSync(skillDir, { recursive: true });
		const skillPath = join(skillDir, "SKILL.md");
		writeFileSync(skillPath, `---\nname: ${name}\ndescription: ${description}\n---\nProject skill content`);
		return skillPath;
	}

	function createSettingsWithPackage(pkgDir: string, scope: "user" | "project"): void {
		const settingsDir = scope === "user" ? agentDir : join(cwd, ".pi");
		mkdirSync(settingsDir, { recursive: true });
		writeFileSync(join(settingsDir, "settings.json"), JSON.stringify({ packages: [pkgDir] }, null, 2));
	}

	it("should disable a user skill that duplicates a package skill", async () => {
		const pkgDir = createPackageWithSkill("web-fetch", "Package web-fetch skill");
		createUserSkill("web-fetch", "User web-fetch override");
		createSettingsWithPackage(pkgDir, "user");

		const loader = new DefaultResourceLoader({ cwd, agentDir });
		await loader.reload();

		const { skills } = loader.getSkills();
		expect(skills.some((skill) => skill.name === "web-fetch")).toBe(false);
	});

	it("should disable a project skill that duplicates a package skill", async () => {
		const pkgDir = createPackageWithSkill("web-fetch", "Package web-fetch skill");
		createProjectSkill("web-fetch", "Project web-fetch override");
		createSettingsWithPackage(pkgDir, "user");

		const loader = new DefaultResourceLoader({ cwd, agentDir });
		await loader.reload();

		const { skills } = loader.getSkills();
		expect(skills.some((skill) => skill.name === "web-fetch")).toBe(false);
	});

	it("should disable all three copies across project, user, and package roots", async () => {
		const pkgDir = createPackageWithSkill("web-fetch", "Package web-fetch skill");
		createUserSkill("web-fetch", "User web-fetch override");
		createProjectSkill("web-fetch", "Project web-fetch override");
		createSettingsWithPackage(pkgDir, "user");

		const loader = new DefaultResourceLoader({ cwd, agentDir });
		await loader.reload();

		const { skills } = loader.getSkills();
		expect(skills.some((skill) => skill.name === "web-fetch")).toBe(false);
		expect(
			loader.getSkills().diagnostics.filter((diagnostic) => diagnostic.collision?.name === "web-fetch"),
		).toHaveLength(3);
	});

	it("collision diagnostics should report every duplicate path", async () => {
		const pkgDir = createPackageWithSkill("web-fetch", "Package web-fetch skill");
		createUserSkill("web-fetch", "User web-fetch override");
		createSettingsWithPackage(pkgDir, "user");

		const loader = new DefaultResourceLoader({ cwd, agentDir });
		await loader.reload();

		const { diagnostics } = loader.getSkills();
		const collisions = diagnostics.filter((d) => d.type === "collision" && d.collision?.name === "web-fetch");
		expect(collisions).toHaveLength(2);
		expect(collisions.some((collision) => collision.path?.includes("fake-package"))).toBe(true);
		expect(collisions.some((collision) => collision.path?.includes(join("agent", "skills")))).toBe(true);
	});
});
