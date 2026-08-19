import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import ignore from "ignore";
import { homedir } from "os";
import { basename, dirname, join, relative, resolve, sep } from "path";
import { CONFIG_DIR_NAME, getAgentDir } from "../config.ts";
import { parseFrontmatter } from "../utils/frontmatter.ts";
import { canonicalizePath, resolvePath } from "../utils/paths.ts";
import type { ResourceDiagnostic } from "./diagnostics.ts";
import { createSyntheticSourceInfo, type SourceInfo } from "./source-info.ts";

/** Max name length per spec */
const MAX_NAME_LENGTH = 64;

/** Max description length per spec */
const MAX_DESCRIPTION_LENGTH = 1024;

const IGNORE_FILE_NAMES = [".gitignore", ".ignore", ".fdignore"];

type IgnoreMatcher = ReturnType<typeof ignore>;

function toPosixPath(p: string): string {
	return p.split(sep).join("/");
}

function prefixIgnorePattern(line: string, prefix: string): string | null {
	const trimmed = line.trim();
	if (!trimmed) return null;
	if (trimmed.startsWith("#") && !trimmed.startsWith("\\#")) return null;

	let pattern = line;
	let negated = false;

	if (pattern.startsWith("!")) {
		negated = true;
		pattern = pattern.slice(1);
	} else if (pattern.startsWith("\\!")) {
		pattern = pattern.slice(1);
	}

	if (pattern.startsWith("/")) {
		pattern = pattern.slice(1);
	}

	const prefixed = prefix ? `${prefix}${pattern}` : pattern;
	return negated ? `!${prefixed}` : prefixed;
}

function addIgnoreRules(ig: IgnoreMatcher, dir: string, rootDir: string): void {
	const relativeDir = relative(rootDir, dir);
	const prefix = relativeDir ? `${toPosixPath(relativeDir)}/` : "";

	for (const filename of IGNORE_FILE_NAMES) {
		const ignorePath = join(dir, filename);
		if (!existsSync(ignorePath)) continue;
		try {
			const content = readFileSync(ignorePath, "utf-8");
			const patterns = content
				.split(/\r?\n/)
				.map((line) => prefixIgnorePattern(line, prefix))
				.filter((line): line is string => Boolean(line));
			if (patterns.length > 0) {
				ig.add(patterns);
			}
		} catch {}
	}
}

export interface SkillFrontmatter {
	name?: string;
	description?: string;
	"disable-model-invocation"?: boolean;
	[key: string]: unknown;
}

export interface Skill {
	name: string;
	description: string;
	filePath: string;
	baseDir: string;
	/** Undefined for eager skills; otherwise the lazy category below the skills root. */
	category?: string;
	sourceInfo: SourceInfo;
	disableModelInvocation: boolean;
}

export interface LoadSkillsResult {
	skills: Skill[];
	diagnostics: ResourceDiagnostic[];
}

/**
 * Validate skill name per Agent Skills spec.
 * Returns array of validation error messages (empty if valid).
 */
function validateName(name: string): string[] {
	const errors: string[] = [];

	if (name.length > MAX_NAME_LENGTH) {
		errors.push(`name exceeds ${MAX_NAME_LENGTH} characters (${name.length})`);
	}

	if (!/^[a-z0-9-]+$/.test(name)) {
		errors.push(`name contains invalid characters (must be lowercase a-z, 0-9, hyphens only)`);
	}

	if (name.startsWith("-") || name.endsWith("-")) {
		errors.push(`name must not start or end with a hyphen`);
	}

	if (name.includes("--")) {
		errors.push(`name must not contain consecutive hyphens`);
	}

	return errors;
}

/**
 * Validate description per Agent Skills spec.
 */
function validateDescription(description: unknown): string[] {
	const errors: string[] = [];

	if (typeof description !== "string" || description.trim() === "") {
		errors.push("description is required");
	} else if (description.length > MAX_DESCRIPTION_LENGTH) {
		errors.push(`description exceeds ${MAX_DESCRIPTION_LENGTH} characters (${description.length})`);
	}

	return errors;
}

export interface LoadSkillsFromDirOptions {
	/** Directory to scan for skills */
	dir: string;
	/** Source identifier for these skills */
	source: string;
}

function isDirectoryEntry(path: string, entry: { isDirectory(): boolean; isSymbolicLink(): boolean }): boolean {
	if (entry.isDirectory()) return true;
	if (!entry.isSymbolicLink()) return false;
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

function visibleDirectories(dir: string, ig: IgnoreMatcher, root: string): string[] {
	try {
		return readdirSync(dir, { withFileTypes: true })
			.filter((entry) => !entry.name.startsWith(".") && entry.name !== "node_modules")
			.map((entry) => ({ entry, path: join(dir, entry.name) }))
			.filter(({ entry, path }) => isDirectoryEntry(path, entry))
			.filter(({ path }) => !ig.ignores(`${toPosixPath(relative(root, path))}/`))
			.map(({ path }) => path)
			.sort();
	} catch {
		return [];
	}
}

function canonicalSkillFile(dir: string, ig: IgnoreMatcher, root: string): string | undefined {
	const filePath = join(dir, "SKILL.md");
	if (!existsSync(filePath)) return undefined;
	try {
		if (!statSync(filePath).isFile() || ig.ignores(toPosixPath(relative(root, filePath)))) return undefined;
		return filePath;
	} catch {
		return undefined;
	}
}

function createSkillSourceInfo(filePath: string, baseDir: string, source: string): SourceInfo {
	switch (source) {
		case "user":
			return createSyntheticSourceInfo(filePath, {
				source: "local",
				scope: "user",
				baseDir,
			});
		case "project":
			return createSyntheticSourceInfo(filePath, {
				source: "local",
				scope: "project",
				baseDir,
			});
		case "path":
			return createSyntheticSourceInfo(filePath, {
				source: "local",
				baseDir,
			});
		default:
			return createSyntheticSourceInfo(filePath, { source, baseDir });
	}
}

/**
 * Load skills from a directory.
 *
 * Discovery rules:
 * - `<root>/<skill>/SKILL.md` is eager
 * - `<root>/<category>/<skill>/SKILL.md` is lazy and categorized
 * - an explicit directory containing `SKILL.md` is one eager skill
 * - no other Markdown file or deeper `SKILL.md` is a skill
 */
export function loadSkillsFromDir(options: LoadSkillsFromDirOptions): LoadSkillsResult {
	const { dir, source } = options;
	return loadSkillsFromDirInternal(dir, source);
}

function loadSkillsFromDirInternal(dir: string, source: string): LoadSkillsResult {
	const skills: Skill[] = [];
	const diagnostics: ResourceDiagnostic[] = [];

	if (!existsSync(dir)) {
		return { skills, diagnostics };
	}

	const root = resolve(dir);
	const ig = ignore();
	addIgnoreRules(ig, root, root);
	const rootSkill = canonicalSkillFile(root, ig, root);
	if (rootSkill) {
		const result = loadSkillFromFile(rootSkill, source);
		if (result.skill) skills.push(result.skill);
		diagnostics.push(...result.diagnostics);
		return { skills, diagnostics };
	}

	for (const firstLevelDir of visibleDirectories(root, ig, root)) {
		addIgnoreRules(ig, firstLevelDir, root);
		const eagerFile = canonicalSkillFile(firstLevelDir, ig, root);
		if (eagerFile) {
			const result = loadSkillFromFile(eagerFile, source);
			if (result.skill) skills.push(result.skill);
			diagnostics.push(...result.diagnostics);
			continue;
		}

		const category = basename(firstLevelDir);
		const categoryErrors = validateName(category);
		if (categoryErrors.length > 0) {
			for (const error of categoryErrors) {
				diagnostics.push({ type: "warning", message: `invalid skill category: ${error}`, path: firstLevelDir });
			}
			continue;
		}
		for (const skillDir of visibleDirectories(firstLevelDir, ig, root)) {
			addIgnoreRules(ig, skillDir, root);
			const lazyFile = canonicalSkillFile(skillDir, ig, root);
			if (!lazyFile) continue;
			const result = loadSkillFromFile(lazyFile, source, category);
			if (result.skill) skills.push(result.skill);
			diagnostics.push(...result.diagnostics);
		}
	}

	return { skills, diagnostics };
}

function loadSkillFromFile(
	filePath: string,
	source: string,
	category?: string,
): { skill: Skill | null; diagnostics: ResourceDiagnostic[] } {
	const diagnostics: ResourceDiagnostic[] = [];
	if (basename(filePath) !== "SKILL.md") {
		return {
			skill: null,
			diagnostics: [{ type: "warning", message: "skill path is not a canonical SKILL.md file", path: filePath }],
		};
	}
	if (category) {
		const categoryErrors = validateName(category);
		for (const error of categoryErrors) {
			diagnostics.push({ type: "warning", message: `invalid skill category: ${error}`, path: dirname(filePath) });
		}
		if (categoryErrors.length > 0) return { skill: null, diagnostics };
	}

	let rawContent: string;
	try {
		rawContent = readFileSync(filePath, "utf-8");
	} catch (error) {
		const message = error instanceof Error ? error.message : "failed to read skill file";
		diagnostics.push({ type: "warning", message, path: filePath });
		return { skill: null, diagnostics };
	}

	let frontmatter: SkillFrontmatter;
	try {
		({ frontmatter } = parseFrontmatter<SkillFrontmatter>(rawContent));
	} catch (error) {
		const message = error instanceof Error ? error.message : "failed to parse skill file";
		diagnostics.push({ type: "warning", message, path: filePath });
		return { skill: null, diagnostics };
	}

	const description = frontmatter.description;
	const hasDescription = typeof description === "string" && description.trim() !== "";
	const skillDir = dirname(filePath);
	const parentDirName = basename(skillDir);

	// Validate description
	const descErrors = validateDescription(description);
	for (const error of descErrors) {
		diagnostics.push({ type: "warning", message: error, path: filePath });
	}

	// Use name from frontmatter, or fall back to parent directory name
	const frontmatterName = typeof frontmatter.name === "string" ? frontmatter.name : undefined;
	const name = frontmatterName || parentDirName;

	// Validate name
	const nameErrors = validateName(name);
	for (const error of nameErrors) {
		diagnostics.push({ type: "warning", message: error, path: filePath });
	}

	// Still load the skill even with warnings, unless description is missing or empty.
	if (!hasDescription) {
		return { skill: null, diagnostics };
	}

	return {
		skill: {
			name,
			description,
			filePath,
			baseDir: skillDir,
			...(category ? { category } : {}),
			sourceInfo: createSkillSourceInfo(filePath, skillDir, source),
			disableModelInvocation: frontmatter["disable-model-invocation"] === true,
		},
		diagnostics,
	};
}

/**
 * Format skills for inclusion in a system prompt.
 * Uses XML format per Agent Skills standard.
 * See: https://agentskills.io/integrate-skills
 *
 * Skills with disableModelInvocation=true are excluded from the prompt
 * (they can only be invoked explicitly via /skill:name commands).
 */
export function formatSkillsForPrompt(skills: Skill[]): string {
	const visibleSkills = skills.filter((s) => !s.disableModelInvocation && s.category === undefined);

	if (visibleSkills.length === 0) {
		return "";
	}

	const lines = [
		"\n\nThe following skills provide specialized instructions for specific tasks.",
		"Use the read tool to load a skill's file when the task matches its description.",
		"When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.",
		"",
		"<available_skills>",
	];

	for (const skill of visibleSkills) {
		lines.push("  <skill>");
		lines.push(`    <name>${escapeXml(skill.name)}</name>`);
		lines.push(`    <description>${escapeXml(skill.description)}</description>`);
		lines.push(`    <location>${escapeXml(skill.filePath)}</location>`);
		lines.push("  </skill>");
	}

	lines.push("</available_skills>");

	return lines.join("\n");
}

function escapeXml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

export interface LoadSkillsOptions {
	/** Working directory for project-local skills. */
	cwd: string;
	/** Agent config directory for global skills. */
	agentDir: string;
	/** Explicit skill paths (files or directories) */
	skillPaths: string[];
	/** Include default skills directories. */
	includeDefaults: boolean;
}

/**
 * Load skills from all configured locations.
 * Returns skills and any validation diagnostics.
 */
export function loadSkills(options: LoadSkillsOptions): LoadSkillsResult {
	const { agentDir, skillPaths, includeDefaults } = options;

	// Resolve agentDir - if not provided, use default from config
	const resolvedCwd = resolvePath(options.cwd);
	const resolvedAgentDir = resolvePath(agentDir ?? getAgentDir());

	const uniqueSkills: Skill[] = [];
	const realPathSet = new Set<string>();
	const allDiagnostics: ResourceDiagnostic[] = [];

	function addSkills(result: LoadSkillsResult) {
		allDiagnostics.push(...result.diagnostics);
		for (const skill of result.skills) {
			// Resolve symlinks to detect duplicate files
			const realPath = canonicalizePath(skill.filePath);

			// Skip silently if we've already loaded this exact file (via symlink)
			if (realPathSet.has(realPath)) {
				continue;
			}
			realPathSet.add(realPath);
			uniqueSkills.push(skill);
		}
	}

	if (includeDefaults) {
		addSkills(loadSkillsFromDirInternal(join(resolvedAgentDir, "skills"), "user"));
		addSkills(loadSkillsFromDirInternal(resolve(resolvedCwd, CONFIG_DIR_NAME, "skills"), "project"));
	}

	const userSkillsDir = join(resolvedAgentDir, "skills");
	const projectSkillsDir = resolve(resolvedCwd, CONFIG_DIR_NAME, "skills");

	const isUnderPath = (target: string, root: string): boolean => {
		const normalizedRoot = resolve(root);
		if (target === normalizedRoot) {
			return true;
		}
		const prefix = normalizedRoot.endsWith(sep) ? normalizedRoot : `${normalizedRoot}${sep}`;
		return target.startsWith(prefix);
	};

	const getSource = (resolvedPath: string): "user" | "project" | "path" => {
		if (!includeDefaults) {
			if (isUnderPath(resolvedPath, userSkillsDir)) return "user";
			if (isUnderPath(resolvedPath, projectSkillsDir)) return "project";
		}
		return "path";
	};

	const categoryForKnownRoot = (filePath: string): string | undefined => {
		const knownRoots = [userSkillsDir, projectSkillsDir, join(process.env.HOME || homedir(), ".agents", "skills")];
		let current = resolvedCwd;
		while (true) {
			knownRoots.push(join(current, ".agents", "skills"));
			const parent = dirname(current);
			if (parent === current) break;
			current = parent;
		}
		for (const root of knownRoots) {
			const parts = relative(resolve(root), filePath).split(sep);
			if (parts.length === 3 && parts[2] === "SKILL.md" && parts[0] !== "..") return parts[0];
		}
		return undefined;
	};

	for (const rawPath of skillPaths) {
		const resolvedPath = resolvePath(rawPath, resolvedCwd, { trim: true });
		if (!existsSync(resolvedPath)) {
			allDiagnostics.push({ type: "warning", message: "skill path does not exist", path: resolvedPath });
			continue;
		}

		try {
			const stats = statSync(resolvedPath);
			const source = getSource(resolvedPath);
			if (stats.isDirectory()) {
				addSkills(loadSkillsFromDirInternal(resolvedPath, source));
			} else if (stats.isFile() && basename(resolvedPath) === "SKILL.md") {
				const result = loadSkillFromFile(resolvedPath, source, categoryForKnownRoot(resolvedPath));
				if (result.skill) {
					addSkills({ skills: [result.skill], diagnostics: result.diagnostics });
				} else {
					allDiagnostics.push(...result.diagnostics);
				}
			} else {
				allDiagnostics.push({
					type: "warning",
					message: "skill path is not a canonical SKILL.md file",
					path: resolvedPath,
				});
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : "failed to read skill path";
			allDiagnostics.push({ type: "warning", message, path: resolvedPath });
		}
	}

	const skillsByName = new Map<string, Skill[]>();
	for (const skill of uniqueSkills) {
		const named = skillsByName.get(skill.name) ?? [];
		named.push(skill);
		skillsByName.set(skill.name, named);
	}
	const skills: Skill[] = [];
	const collisionDiagnostics: ResourceDiagnostic[] = [];
	for (const [name, named] of skillsByName) {
		if (named.length === 1) {
			skills.push(named[0]);
			continue;
		}
		const paths = named.map((skill) => skill.filePath);
		for (const skill of named) {
			collisionDiagnostics.push({
				type: "collision",
				message: `duplicate skill name "${name}"; disabled all copies: ${paths.join(", ")}`,
				path: skill.filePath,
				collision: {
					resourceType: "skill",
					name,
					winnerPath: paths[0],
					loserPath: skill.filePath,
					allDisabled: true,
				},
			});
		}
	}

	return { skills, diagnostics: [...allDiagnostics, ...collisionDiagnostics] };
}
