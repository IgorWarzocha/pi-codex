import { dirname } from "node:path";
import { getDefaultCodexRuntimeShell } from "../adapter/prompt/runtime-shell.ts";
import { getReadmePath } from "../config.ts";
import type { Skill } from "./skills.ts";

export type CodexPromptMode = "normal" | "code" | "notebook";

export interface BuildSystemPromptOptions {
	/** Custom system prompt content. Pi-Codex runtime guidance is still appended. */
	customPrompt?: string;
	/** Active tools, retained for extension API compatibility. */
	selectedTools?: string[];
	/** Tool snippets, retained for extension API compatibility. */
	toolSnippets?: Record<string, string>;
	/** Additional guideline bullets. */
	promptGuidelines?: string[];
	/** Text to append to the system prompt. */
	appendSystemPrompt?: string;
	/** Working directory. */
	cwd: string;
	/** Current execution mode. */
	mode?: CodexPromptMode;
	/** Configured shell path. */
	shell?: string;
	/** Pre-loaded context files. */
	contextFiles?: Array<{ path: string; content: string }>;
	/** Pre-loaded skills. */
	skills?: Skill[];
}

const EXEC_SESSION_GUIDELINE =
	"For unfinished exec_command sessions, use write_stdin with yield_time_ms near the command's expected remaining time and lengthen later waits";

const NORMAL_CODEX_GUIDELINES = [
	"Use exec_command for shell commands, file inspection, builds, and tests; prefer rg / rg --files for discovery and focused commands over truncation",
	"Reserve tty=true for input or persistent processes",
	"Use apply_patch for text-file changes, including creates/deletes/moves; split oversized patches",
	EXEC_SESSION_GUIDELINE,
	"Run independent tool calls in parallel when practical",
];

const CODE_MODE_GUIDELINES = [
	"Use tools.exec_command for shell commands; prefer rg and rg --files",
	"For tools.exec_command cmd, use String.raw only without backticks or $" +
		"{}; avoid nested quoting; split independent commands into separate calls",
	"Long command: keep tools.exec_command awaited inside exec; resume the yielded cell_id with wait near completion. Do not request a short child yield and poll its session_id with tools.write_stdin",
	"Use tty=true only for input or persistent processes",
	"Use tools.apply_patch(patch) for file edits; split large patches; reserve shell/Python for formatting or bulk rewrites",
	"Await dependencies; use Promise.all for independent calls",
	"Use text() only for concise final output",
];

const NOTEBOOK_MODE_GUIDELINES = [
	"exec is a persistent Deno/TypeScript Jupyter notebook; project globals may come from earlier agents and sessions",
	"Check notebook status and reuse matching retained globals before rebuilding; inspect description/usage before constructing reusable ones",
	"Keep one-offs block-local; store cheap reusable state and repeatable helpers on purpose-named globalThis properties as unpinned scratch, pin only important prune-resistant state; give helpers concise description/usage with a safe inspection recipe",
	...CODE_MODE_GUIDELINES,
	"Use notebook status to inspect retained state or memory, release/prune disposable state, and diagnostics after broken state or helpers",
	"Filter retained data inside exec and return only needed findings; never dump the namespace",
	"Keep canonical project artifacts in files; tools.exec_command subprocess shell state does not persist",
	"Keep cross-session helpers self-contained; imports, closures, and live handles may need recreation after restart",
	"Each result reports memory; use notebook release/prune before pressure becomes critical",
	"exec calls run sequentially; use wait only to observe or terminate the currently yielded call",
	"Treat all npm packages as unsafe by default; Notebook startup lists prior project imports, and any unlisted package requires user approval before first use plus an exact-version npm: specifier",
	"Use Deno APIs and approved npm: imports for persistent computation; prefer Pi/custom tools for project operations with richer contracts, rendering, bounds, or background handles",
];

function buildGuidelines(mode: CodexPromptMode, additions: string[]): string[] {
	const base =
		mode === "notebook" ? NOTEBOOK_MODE_GUIDELINES : mode === "code" ? CODE_MODE_GUIDELINES : NORMAL_CODEX_GUIDELINES;
	const piPackageRoot = dirname(getReadmePath()).replace(/\\/g, "/");
	return [
		...new Set([
			...base,
			...additions.map((guideline) => guideline.trim()).filter(Boolean),
			`When work depends on Pi APIs or runtime behavior not established in the current repository, consult the relevant README.md, docs/, or examples/ files under ${piPackageRoot} and follow their references before implementing`,
		]),
	];
}

function appendProjectContext(prompt: string, contextFiles: Array<{ path: string; content: string }>): string {
	if (contextFiles.length === 0) return prompt;
	const files = contextFiles
		.map(({ path, content }) => `<project_instructions path="${path}">\n${content}\n</project_instructions>`)
		.join("\n\n");
	return `${prompt}\n\n<project_context>\n\nProject-specific instructions and guidelines:\n\n${files}\n\n</project_context>`;
}

function buildSkillsSection(skills: Skill[]): string {
	const visible = skills.filter((skill) => !skill.disableModelInvocation);
	if (visible.length === 0) return "";
	const lines = [
		"<skills_instructions>",
		"## Skills",
		"Skill: local instructions in `SKILL.md` file",
		"### Available skills",
		...visible.map((skill) => `- ${skill.name}: ${skill.description} (file: ${skill.filePath})`),
		"### How to use skills",
		"- Use skill when user names it (`$SkillName` or plain text) or request clearly matches its description",
		"- Use the minimal required set of skills. If multiple apply, use them together and state the order briefly",
		"- For each selected skill, open its `SKILL.md`, resolve relative paths from the skill directory first, load only the files you need, and prefer existing scripts/assets/templates over recreating them",
		"### Fallback",
		"- If skill is missing or path cannot be read, say so briefly and continue with best fallback approach",
		"</skills_instructions>",
	];
	return lines.join("\n");
}

function resolveShell(configuredShell: string | undefined): string {
	try {
		return getDefaultCodexRuntimeShell(configuredShell);
	} catch {
		return configuredShell ?? process.env.SHELL ?? "/bin/bash";
	}
}

/** Build the native Pi-Codex prompt without constructing or rewriting Pi's stock prompt. */
export function buildSystemPrompt(options: BuildSystemPromptOptions): string {
	const mode = options.mode ?? "normal";
	const guidelines = buildGuidelines(mode, options.promptGuidelines ?? []);
	const sections: string[] = [];
	if (options.customPrompt?.trim()) sections.push(options.customPrompt.trim());
	sections.push(`Guidelines:\n${guidelines.map((guideline) => `- ${guideline}`).join("\n")}`);
	if (options.appendSystemPrompt?.trim()) sections.push(options.appendSystemPrompt.trim());

	let prompt = sections.join("\n\n");
	prompt = appendProjectContext(prompt, options.contextFiles ?? []);
	const skills = buildSkillsSection(options.skills ?? []);
	if (skills) prompt += `\n\n${skills}`;
	const shell = resolveShell(options.shell);
	const shellName = shell.replace(/\\/g, "/").split("/").pop()?.toLowerCase();
	const zshGuidance = shellName === "zsh" || shellName === "zsh.exe" ? "; status is read-only, capture $? as rc" : "";
	prompt += `\n\nCurrent shell: ${shell}; follow its syntax, quoting, and variable rules${zshGuidance}`;
	prompt += `\n\nCurrent working directory: ${options.cwd.replace(/\\/g, "/")}`;
	return prompt.trim();
}
