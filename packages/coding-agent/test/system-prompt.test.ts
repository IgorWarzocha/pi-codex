import { describe, expect, test } from "vitest";
import type { Skill } from "../src/core/skills.ts";
import { createSyntheticSourceInfo } from "../src/core/source-info.ts";
import { buildSystemPrompt } from "../src/core/system-prompt.ts";

describe("buildSystemPrompt", () => {
	test("builds the native Pi-Codex prompt without the stock tool scaffold", () => {
		const prompt = buildSystemPrompt({
			cwd: "/workspace",
			shell: "/usr/bin/zsh",
			selectedTools: ["exec"],
		});

		expect(prompt).not.toContain("Available tools:");
		expect(prompt).not.toContain("You are an expert coding assistant operating inside pi");
		expect(prompt).toContain("- Use tools.exec_command for shell commands; prefer rg and rg --files");
		expect(prompt).toContain("- Use tools.apply_patch(patch) for file edits");
		expect(prompt).toContain(
			"Current shell: /usr/bin/zsh; follow its syntax, quoting, and variable rules; status is read-only, capture $? as rc",
		);
		expect(prompt).toContain("Current working directory: /workspace");
	});

	test("preserves explicit prompt content and merges project guidance directly", () => {
		const prompt = buildSystemPrompt({
			customPrompt: "Own the outcome.",
			appendSystemPrompt: "Keep changes small.",
			promptGuidelines: ["Inspect before editing", " Inspect before editing "],
			contextFiles: [{ path: "/workspace/AGENTS.md", content: "Project rule" }],
			cwd: "/workspace",
			shell: "/bin/bash",
		});

		expect(prompt.startsWith("Own the outcome.")).toBe(true);
		expect(prompt.match(/- Inspect before editing/g)).toHaveLength(1);
		expect(prompt).toContain("Keep changes small.");
		expect(prompt).toContain('<project_instructions path="/workspace/AGENTS.md">\nProject rule');
	});

	test("selects Code Mode guidance without normal-mode shell wording", () => {
		const prompt = buildSystemPrompt({ cwd: "/workspace", shell: "/bin/bash", mode: "code" });

		expect(prompt).toContain("- Use tools.exec_command for shell commands; prefer rg and rg --files");
		expect(prompt).toContain("- Use text() only for concise final output");
		expect(prompt).not.toContain("Use exec_command for shell commands, file inspection");
	});

	test("treats Notebook globals as multi-cell working memory", () => {
		const prompt = buildSystemPrompt({ cwd: "/workspace", shell: "/bin/bash", mode: "notebook" });

		expect(prompt).toContain("use purpose-named globalThis properties as deliberate working memory across cells");
		expect(prompt).toContain("verified cwd or repo roots, target paths, host facts, task decisions, parsed indexes");
		expect(prompt).toContain("update them instead of re-probing and release them when stale or done");
	});

	test("announces important skills and lazy categories without exposing package paths", () => {
		const skill = (name: string, category?: string): Skill => ({
			name,
			description: `${name} description`,
			filePath: `/skills/${category ? `${category}/` : ""}${name}/SKILL.md`,
			baseDir: `/skills/${category ? `${category}/` : ""}${name}`,
			...(category ? { category } : {}),
			sourceInfo: createSyntheticSourceInfo(`/skills/${name}/SKILL.md`, { source: "test" }),
			disableModelInvocation: false,
		});
		const prompt = buildSystemPrompt({
			cwd: "/workspace",
			mode: "code",
			skills: [skill("deploy"), skill("hardening", "swe")],
		});

		expect(prompt).toContain("- deploy: deploy description");
		expect(prompt).not.toContain("hardening description");
		expect(prompt).toContain("### Categories\n- swe");
		expect(prompt).toContain("`list <category>...`");
		expect(prompt).toContain("`read <exact-skill-name>`");
		expect(prompt).toContain('call `tools.skills("...")`');
		expect(prompt).not.toContain("/skills/");
	});

	test("keeps the skills block in Code Mode without a read tool", () => {
		const skill: Skill = {
			name: "deploy",
			description: "Deploy safely",
			filePath: "/skills/deploy/SKILL.md",
			baseDir: "/skills/deploy",
			sourceInfo: createSyntheticSourceInfo("/skills/deploy/SKILL.md", { source: "test" }),
			disableModelInvocation: false,
		};
		const prompt = buildSystemPrompt({
			cwd: "/workspace",
			mode: "code",
			selectedTools: ["exec"],
			skills: [skill],
		});

		expect(prompt).toContain("<skills_instructions>");
		expect(prompt).toContain("- deploy: Deploy safely");
		expect(prompt).toContain('call `tools.skills("...")`');
		expect(prompt).not.toContain("SKILL.md");
		expect(prompt).not.toContain("read tool");
	});
});
