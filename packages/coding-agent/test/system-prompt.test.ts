import { describe, expect, test } from "vitest";
import { buildSystemPrompt } from "../src/core/system-prompt.ts";

describe("buildSystemPrompt", () => {
	test("builds the native Pi-Codex prompt without the stock tool scaffold", () => {
		const prompt = buildSystemPrompt({
			cwd: "/workspace",
			shell: "/usr/bin/zsh",
			selectedTools: ["exec_command", "apply_patch"],
			toolSnippets: { exec_command: "Run command", apply_patch: "Patch files" },
		});

		expect(prompt).not.toContain("Available tools:");
		expect(prompt).not.toContain("You are an expert coding assistant operating inside pi");
		expect(prompt).toContain("- Use exec_command for shell commands, file inspection, builds, and tests");
		expect(prompt).toContain("- Use apply_patch for text-file changes, including creates/deletes/moves");
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
});
