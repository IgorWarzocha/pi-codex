import { Buffer } from "node:buffer";
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Skill } from "../../core/skills.ts";
import { stripFrontmatter } from "../../utils/frontmatter.ts";
import type { ProgrammaticCodeModeToolDefinition } from "./types.ts";

const MAX_OUTPUT_BYTES = 48 * 1024;

type SkillsRequest = { action: "list"; categories: string[] } | { action: "read"; name: string };

function parseRequest(input: unknown): SkillsRequest {
	if (typeof input !== "string") throw new Error("skills expects a string command");
	const [action, ...args] = input.trim().split(/\s+/).filter(Boolean);
	if (action === "list") return { action, categories: [...new Set(args)] };
	if (action === "read" && args.length === 1) return { action, name: args[0] };
	if (action === "read") throw new Error('read expects exactly one skill name: "read <exact-skill-name>"');
	throw new Error('Expected "list", "list <category>...", or "read <exact-skill-name>"');
}

function oneLine(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function formatList(skills: Skill[], categories: string[]): string {
	const availableCategories = [...new Set(skills.flatMap((skill) => (skill.category ? [skill.category] : [])))].sort();
	const unknown = categories.filter((category) => !availableCategories.includes(category));
	if (unknown.length > 0) {
		throw new Error(
			`Unknown categor${unknown.length === 1 ? "y" : "ies"}: ${unknown.join(", ")}. Available: ${availableCategories.join(", ") || "none"}`,
		);
	}
	const selected =
		categories.length > 0 ? skills.filter((skill) => skill.category && categories.includes(skill.category)) : skills;
	if (selected.length === 0) return "No skills available.";

	const groups = new Map<string, Skill[]>();
	for (const skill of selected) {
		const category = skill.category ?? "important";
		const group = groups.get(category) ?? [];
		group.push(skill);
		groups.set(category, group);
	}
	const lines: string[] = [];
	for (const [category, categorySkills] of [...groups].sort(([left], [right]) => left.localeCompare(right))) {
		lines.push(`# ${category.replace(/-/g, " ").toUpperCase()}`);
		for (const skill of categorySkills.sort((left, right) => left.name.localeCompare(right.name))) {
			lines.push(`- ${skill.name}: ${oneLine(skill.description)}`);
		}
	}
	return lines.join("\n");
}

function isWithin(root: string, path: string): boolean {
	const child = relative(root, path);
	return child === "" || (!child.startsWith(`..${sep}`) && child !== ".." && !isAbsolute(child));
}

function packagePaths(skill: Skill): string[] {
	const root = realpathSync(skill.baseDir);
	const paths: string[] = [];
	const visited = new Set<string>();
	const listAssetEntries = (directory: string): void => {
		for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
			left.name.localeCompare(right.name),
		)) {
			if (entry.name.startsWith(".")) continue;
			const path = join(directory, entry.name);
			try {
				if (!isWithin(root, realpathSync(path))) continue;
			} catch {
				continue;
			}
			paths.push(resolve(path));
		}
	};
	const visit = (directory: string): void => {
		const realDirectory = realpathSync(directory);
		if (!isWithin(root, realDirectory) || visited.has(realDirectory)) return;
		visited.add(realDirectory);
		for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
			left.name.localeCompare(right.name),
		)) {
			if (entry.name.startsWith(".")) continue;
			const path = join(directory, entry.name);
			let realPath: string;
			let isDirectory = entry.isDirectory();
			let isFile = entry.isFile();
			try {
				realPath = realpathSync(path);
				if (entry.isSymbolicLink()) {
					const stats = statSync(path);
					isDirectory = stats.isDirectory();
					isFile = stats.isFile();
				}
			} catch {
				continue;
			}
			if (!isWithin(root, realPath)) continue;
			if (isDirectory) {
				if (directory === skill.baseDir && entry.name === "assets") listAssetEntries(path);
				else visit(path);
			} else if (isFile) paths.push(resolve(path));
		}
	};
	visit(skill.baseDir);
	return paths.sort((left, right) => {
		if (left === skill.filePath) return -1;
		if (right === skill.filePath) return 1;
		return left.localeCompare(right);
	});
}

function formatSkill(skill: Skill): string {
	const body = stripFrontmatter(readFileSync(skill.filePath, "utf8")).trim();
	const paths = packagePaths(skill);
	return `${body}\n\n---\nSkill paths (${paths.length}):\n${paths.map((path) => `- ${path}`).join("\n")}`;
}

function enforceOutputLimit(output: string): string {
	const bytes = Buffer.byteLength(output);
	if (bytes > MAX_OUTPUT_BYTES)
		throw new Error(`skills output is ${bytes} bytes; maximum is ${MAX_OUTPUT_BYTES} bytes`);
	return output;
}

export function runSkillsCommand(input: unknown, skills: Skill[]): string {
	const request = parseRequest(input);
	if (request.action === "list") return enforceOutputLimit(formatList(skills, request.categories));
	const skill = skills.find((candidate) => candidate.name === request.name);
	if (!skill) {
		throw new Error(
			`Unknown skill "${request.name}". Available: ${
				skills
					.map(({ name }) => name)
					.sort()
					.join(", ") || "none"
			}`,
		);
	}
	return enforceOutputLimit(formatSkill(skill));
}

export function createSkillsCodeModeTool(options: {
	getSkills(): Skill[];
	refreshSkills(): Promise<void>;
}): ProgrammaticCodeModeToolDefinition {
	return {
		name: "skills",
		usage: 'await tools.skills("list" | "list <category>..." | "read <exact-skill-name>")',
		description: "List categorized skills or read an exact skill package",
		deferLoading: false,
		kind: "freeform",
		async invoke(input, _context, signal) {
			signal.throwIfAborted();
			await options.refreshSkills();
			signal.throwIfAborted();
			return runSkillsCommand(input, options.getSkills());
		},
	};
}
