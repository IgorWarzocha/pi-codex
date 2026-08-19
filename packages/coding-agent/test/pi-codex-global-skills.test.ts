import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ENV_AGENT_DIR, ENV_APP_HOME, getAgentDir } from "../src/config.ts";
import { DefaultPackageManager } from "../src/core/package-manager.ts";
import { SettingsManager } from "../src/core/settings-manager.ts";
import { loadSkills } from "../src/core/skills.ts";

describe("Pi-Codex global skills", () => {
	const originalHome = process.env.HOME;
	const originalAgentDir = process.env[ENV_AGENT_DIR];
	const originalAppHome = process.env[ENV_APP_HOME];
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "pi-codex-shared-skills-"));
		process.env.HOME = root;
		process.env[ENV_APP_HOME] = join(root, ".pi-codex");
		delete process.env[ENV_AGENT_DIR];
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
		if (originalHome === undefined) delete process.env.HOME;
		else process.env.HOME = originalHome;
		if (originalAgentDir === undefined) delete process.env[ENV_AGENT_DIR];
		else process.env[ENV_AGENT_DIR] = originalAgentDir;
		if (originalAppHome === undefined) delete process.env[ENV_APP_HOME];
		else process.env[ENV_APP_HOME] = originalAppHome;
	});

	it("loads only the Pi-Codex global root by default", async () => {
		const cwd = join(root, "project");
		const nativeSkill = join(getAgentDir(), "skills", "swe", "hardening", "SKILL.md");
		const stockSkill = join(root, ".pi", "agent", "skills", "swe", "hardening", "SKILL.md");
		const agentsSkill = join(root, ".agents", "skills", "swe", "hardening", "SKILL.md");
		mkdirSync(join(cwd), { recursive: true });
		mkdirSync(dirname(nativeSkill), { recursive: true });
		mkdirSync(dirname(stockSkill), { recursive: true });
		mkdirSync(dirname(agentsSkill), { recursive: true });
		writeFileSync(nativeSkill, "---\nname: native-hardening\ndescription: Native skill\n---\nNative", "utf-8");
		writeFileSync(stockSkill, "---\nname: stock-hardening\ndescription: Stock skill\n---\nStock", "utf-8");
		writeFileSync(agentsSkill, "---\nname: agents-hardening\ndescription: Agents skill\n---\nAgents", "utf-8");

		const packageManager = new DefaultPackageManager({
			cwd,
			agentDir: getAgentDir(),
			settingsManager: SettingsManager.inMemory(),
		});
		const resolved = await packageManager.resolve();
		const paths = resolved.skills.filter((skill) => skill.enabled).map((skill) => skill.path);

		expect(paths).toContain(nativeSkill);
		expect(paths).not.toContain(stockSkill);
		expect(paths).not.toContain(agentsSkill);
		const loaded = loadSkills({ cwd, agentDir: getAgentDir(), skillPaths: paths, includeDefaults: false });
		expect(loaded.skills.find((skill) => skill.name === "native-hardening")?.category).toBe("swe");
	});
});
