import { existsSync, promises as fs, statSync } from "node:fs";
import { basename, dirname, join, normalize, relative } from "node:path";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ImageContent, TextContent } from "@earendil-works/pi-ai";
import { loadContextFileFromDir, PROJECT_CONTEXT_FILE_NAMES } from "../context-files.ts";
import { contentRootForTarget, isInsideRoot, resolveContextPath } from "./paths.ts";
import {
	isDiscoveryShellCommand,
	isPathOutputShellCommand,
	shellOutputBase,
	shellOutputToolName,
	shellTargets,
} from "./shell-targets.ts";

export const NESTED_CONTEXT_DETAILS_KEY = "subdirContextAutoload";

export interface PersistedContextFile {
	path: string;
	content: string;
}

interface DiscoveryEvent {
	toolName: string;
	input: Record<string, unknown>;
	content: Array<TextContent | ImageContent>;
}

export interface NestedContextToolResult extends DiscoveryEvent {
	details?: unknown;
	isError: boolean;
}

export interface NestedContextTransform {
	content: Array<TextContent | ImageContent>;
	details: Record<string, unknown>;
	loadedPaths: string[];
	errors: Array<{ path: string; message: string }>;
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function contentItems(value: unknown): DiscoveryEvent["content"] | undefined {
	if (!Array.isArray(value)) return undefined;
	return value.flatMap((item): DiscoveryEvent["content"] => {
		const record = objectRecord(item);
		if (record?.["type"] === "text" && typeof record["text"] === "string") {
			return [{ type: "text", text: record["text"] }];
		}
		if (
			record?.["type"] === "image" &&
			typeof record["data"] === "string" &&
			typeof record["mimeType"] === "string"
		) {
			return [{ type: "image", data: record["data"], mimeType: record["mimeType"] }];
		}
		return [];
	});
}

function discoveryEvents(event: NestedContextToolResult): DiscoveryEvent[] {
	const events: DiscoveryEvent[] = event.isError ? [] : [event];
	const details = objectRecord(event.details);
	if (details?.["codeMode"] !== true || !Array.isArray(details["traces"])) return events;

	for (const value of details["traces"]) {
		const trace = objectRecord(value);
		if (trace?.["status"] !== "done" || typeof trace["name"] !== "string") continue;
		const input = objectRecord(trace["input"]);
		const result = objectRecord(trace["result"]);
		const content = contentItems(result?.["content"]);
		if (input && content) events.push({ toolName: trace["name"], input, content });
	}
	return events;
}

function parsePersistedContextFiles(details: unknown): PersistedContextFile[] {
	const value = objectRecord(details)?.[NESTED_CONTEXT_DETAILS_KEY];
	const files = objectRecord(value)?.["files"];
	if (!Array.isArray(files)) return [];
	return files.flatMap((item) => {
		const record = objectRecord(item);
		return record && typeof record["path"] === "string" && typeof record["content"] === "string"
			? [{ path: record["path"], content: record["content"] }]
			: [];
	});
}

function messageDetails(message: AgentMessage): unknown {
	return "details" in message ? message.details : undefined;
}

function escapeXml(value: string): string {
	return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function appendContext(content: DiscoveryEvent["content"], files: PersistedContextFile[]): DiscoveryEvent["content"] {
	if (!files.length) return content;
	const appendix = [
		"<subdirectory_agents_context>",
		"AGENTS.md context relevant to this tool result.",
		...files.map(
			(file) => `<agents_file path="${escapeXml(file.path)}">\n${escapeXml(file.content)}\n</agents_file>`,
		),
		"</subdirectory_agents_context>",
	].join("\n");
	return [...content, { type: "text", text: appendix }];
}

function findContextFiles(filePath: string, rootDir: string, excludedPaths: Set<string>): string[] {
	if (!rootDir) return [];
	const files: string[] = [];
	let dir = dirname(filePath);
	while (isInsideRoot(rootDir, dir)) {
		const contextFile = loadContextFileFromDir(dir);
		if (contextFile && !excludedPaths.has(normalize(contextFile.path))) files.push(contextFile.path);
		if (dir === rootDir) break;
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return files.reverse();
}

function outputPathCandidate(line: string, toolName: string): string {
	if (toolName !== "grep") return line;
	const match = line.match(/^(.+?):\d+(?::\d+)?:/);
	return match?.[1] ?? line.split(":", 1)[0] ?? line;
}

function looksPathLike(value: string): boolean {
	return Boolean(value) && !value.includes("\0") && !value.startsWith("<");
}

function isProjectContextFile(targetPath: string): boolean {
	return PROJECT_CONTEXT_FILE_NAMES.includes(basename(targetPath) as (typeof PROJECT_CONTEXT_FILE_NAMES)[number]);
}

export class NestedContextManager {
	private readonly cwd: string;
	private enabled: boolean;
	private readonly startupContext = new Map<string, string>();
	private readonly loadedContext = new Map<string, string>();

	constructor(options: {
		cwd: string;
		enabled: boolean;
		startupFiles: Array<{ path: string; content: string }>;
		messages: readonly AgentMessage[];
	}) {
		this.cwd = resolveContextPath(options.cwd, process.cwd());
		this.enabled = options.enabled;
		this.reset(options.startupFiles, options.messages);
	}

	reset(startupFiles: Array<{ path: string; content: string }>, messages: readonly AgentMessage[]): void {
		this.startupContext.clear();
		this.loadedContext.clear();
		for (const file of startupFiles) {
			const absolutePath = resolveContextPath(file.path, this.cwd);
			this.startupContext.set(normalize(absolutePath), file.content);
			this.loadedContext.set(normalize(absolutePath), file.content);
		}
		for (const message of messages) this.absorbPersistedFiles(messageDetails(message));
	}

	configure(options: {
		enabled: boolean;
		startupFiles: Array<{ path: string; content: string }>;
		messages: readonly AgentMessage[];
	}): void {
		this.enabled = options.enabled;
		this.reset(options.startupFiles, options.messages);
	}

	private relativePath(absolutePath: string): string {
		return (relative(this.cwd, absolutePath) || absolutePath).replaceAll("\\", "/");
	}

	private absorbPersistedFiles(details: unknown): void {
		for (const file of parsePersistedContextFiles(details)) {
			const absolutePath = resolveContextPath(file.path, this.cwd);
			this.loadedContext.set(normalize(absolutePath), file.content);
		}
	}

	private pathsFromToolText(content: DiscoveryEvent["content"], base: string, toolName: string): string[] {
		return content.flatMap((item) => {
			if (item.type !== "text" || !item.text) return [];
			return item.text
				.split(/\r?\n/)
				.slice(0, 250)
				.map((line) => outputPathCandidate(line.trim(), toolName))
				.filter((line) => line && looksPathLike(line))
				.map((line) => resolveContextPath(line, base))
				.filter((candidate) => existsSync(candidate));
		});
	}

	private targetsForEvent(event: DiscoveryEvent): string[] {
		const isRead = event.toolName === "read";
		const isPathDiscoveryTool = ["grep", "find", "ls"].includes(event.toolName);
		const workdir = ["workdir", "cwd", "working_directory"]
			.map((key) => event.input[key])
			.find((value): value is string => typeof value === "string");
		const eventCwd = workdir === undefined ? this.cwd : resolveContextPath(workdir, this.cwd);
		const shellInput =
			typeof event.input["command"] === "string"
				? event.input["command"]
				: typeof event.input["cmd"] === "string"
					? event.input["cmd"]
					: undefined;
		const isShell = ["bash", "exec_command", "shell"].includes(event.toolName);
		if (!isRead && !isShell && !isPathDiscoveryTool) return [];
		const pathInput = typeof event.input["path"] === "string" ? event.input["path"] : undefined;
		const isDiscoveryShell = isShell && shellInput !== undefined && isDiscoveryShellCommand(shellInput);
		if (!isRead && !isPathDiscoveryTool && !isDiscoveryShell) return [];

		if (isRead) return [pathInput ? resolveContextPath(pathInput, eventCwd) : eventCwd];
		if (isPathDiscoveryTool) {
			const base = pathInput ? resolveContextPath(pathInput, eventCwd) : eventCwd;
			return [base, ...this.pathsFromToolText(event.content, base, event.toolName)];
		}
		if (!shellInput) return [];
		const base = shellOutputBase(shellInput, eventCwd);
		const outputPaths = isPathOutputShellCommand(shellInput)
			? this.pathsFromToolText(event.content, base, shellOutputToolName(shellInput))
			: [];
		return [...shellTargets(shellInput, eventCwd), ...outputPaths];
	}

	private contextFilesForTargets(targets: string[]): string[] {
		const files = new Set<string>();
		const startupPaths = new Set(this.startupContext.keys());
		for (const target of targets) {
			if (isProjectContextFile(target)) continue;
			const searchRoot = contentRootForTarget(target);
			if (!searchRoot) continue;
			let probe = target;
			try {
				if (existsSync(target) && statSync(target).isDirectory()) probe = join(target, "__probe__");
			} catch {
				continue;
			}
			for (const file of findContextFiles(probe, searchRoot, startupPaths)) files.add(file);
		}
		return [...files];
	}

	async transform(event: NestedContextToolResult): Promise<NestedContextTransform | undefined> {
		if (!this.enabled) return undefined;
		this.absorbPersistedFiles(event.details);
		const targets = discoveryEvents(event).flatMap((item) => this.targetsForEvent(item));
		if (!targets.length) return undefined;

		const directContextFiles = targets.filter(
			(target, index) => isProjectContextFile(target) && targets.indexOf(target) === index,
		);
		const contextFiles = this.contextFilesForTargets(targets);
		if (!directContextFiles.length && !contextFiles.length) return undefined;
		const persistedFiles: PersistedContextFile[] = [];
		const appendixFiles: PersistedContextFile[] = [];
		const loadedPaths: string[] = [];
		const errors: Array<{ path: string; message: string }> = [];

		for (const contextPath of [...directContextFiles, ...contextFiles]) {
			try {
				const content = await fs.readFile(contextPath, "utf-8");
				const normalizedPath = normalize(contextPath);
				if (this.loadedContext.get(normalizedPath) === content) continue;
				const isNew = !this.loadedContext.has(normalizedPath);
				this.loadedContext.set(normalizedPath, content);
				const file = { path: this.relativePath(contextPath), content };
				persistedFiles.push(file);
				if (!directContextFiles.includes(contextPath)) {
					appendixFiles.push(file);
					if (isNew) loadedPaths.push(file.path);
				}
			} catch (error) {
				errors.push({
					path: contextPath,
					message: error instanceof Error ? error.message : String(error),
				});
			}
		}

		if (!persistedFiles.length && !errors.length) return undefined;
		const details = objectRecord(event.details) ?? {};
		return {
			content: appendContext(event.content, appendixFiles),
			details: persistedFiles.length
				? { ...details, [NESTED_CONTEXT_DETAILS_KEY]: { files: persistedFiles } }
				: details,
			loadedPaths,
			errors,
		};
	}
}
