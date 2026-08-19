import type { Api, Model } from "@earendil-works/pi-ai";
import type { EventBus } from "../core/event-bus.ts";
import type { ToolDefinition } from "../core/extensions/types.ts";
import type { Skill } from "../core/skills.ts";
import { createNativeCodeModeTools } from "./code-mode/native-tools.ts";
import { createNotebookTool } from "./code-mode/notebook-tool.ts";
import { createPublicCodeModeTools } from "./code-mode/public-tools.ts";
import { CodeModeRuntime } from "./code-mode/runtime.ts";
import { createExecCommandTracker } from "./exec/command-state.ts";
import { createExecSessionManager } from "./exec/session-manager.ts";
import { getBundledToolBinaryPath } from "./native/binary.ts";

export const CODE_MODE_TOOL_NAMES = ["exec", "wait"] as const;
export const NOTEBOOK_MODE_TOOL_NAMES = ["exec", "wait", "notebook"] as const;
export const DEFAULT_CODEX_TOOL_NAMES = CODE_MODE_TOOL_NAMES;
export const ALL_CODEX_TOOL_NAMES = NOTEBOOK_MODE_TOOL_NAMES;

export type CodexExecutionMode = "code" | "notebook";
export const PI_CODEX_EXEC_SESSIONS_CHANNEL = "pi-codex:exec-sessions";

export interface CodexToolRuntimeOptions {
	agentDir: string;
	cwd: string;
	getNotebookOptions(): {
		maxHeapMiB: number;
		profile?: string | undefined;
	};
	getPiCodexOptions(): {
		customRustBinariesDir?: string | undefined;
		describeImagesForTextModels?: boolean | undefined;
		webSearchModel?: string | undefined;
	};
	getSkills(): Skill[];
	refreshSkills(): Promise<void>;
	onPromotedCustomToolsAdded?(
		tools: Array<{ name: string; usage: string; description?: string; output?: string }>,
	): void;
}

export interface CodexToolRuntime {
	definitions: Record<string, ToolDefinition>;
	toolNames(mode: CodexExecutionMode): readonly string[];
	resolveExecutionMode(model: Model<Api> | undefined, requestedMode: CodexExecutionMode): CodexExecutionMode;
	activateExecutionMode(mode: CodexExecutionMode): void;
	bindEvents(events: EventBus): void;
	buildCodeModePromptSection(projectTrusted: boolean): string;
	resetCodeModePromptTools(): void;
	prepareCodeMode(): Promise<void>;
	checkpointNotebook(): Promise<void>;
	shutdownCodeModeHost(): Promise<void>;
	recordToolStart(toolCallId: string, toolName: string, args: unknown): void;
	recordToolEnd(toolCallId: string, toolName: string): void;
	resetExplorationGroup(): void;
	isErrorResult(toolName: string, details: unknown): boolean;
	shutdown(): Promise<void>;
}

function eraseToolDefinition(definition: unknown): ToolDefinition {
	return definition as ToolDefinition;
}

export function resolveCodexExecutionMode(
	_model: Model<Api> | undefined,
	requestedMode: CodexExecutionMode,
): CodexExecutionMode {
	return requestedMode;
}

export function createCodexToolRuntime(options: CodexToolRuntimeOptions): CodexToolRuntime {
	const tracker = createExecCommandTracker();
	const sessions = createExecSessionManager({
		bridgeBinaryPath: () =>
			getBundledToolBinaryPath("exec_bridge", {}, options.getPiCodexOptions().customRustBinariesDir),
	});
	const removeSessionExitListener = sessions.onSessionExit((sessionId) => tracker.recordSessionFinished(sessionId));
	const codeMode = new CodeModeRuntime({
		agentDir: options.agentDir,
		cwd: options.cwd,
		getTools: (ctx) =>
			createNativeCodeModeTools(tracker, sessions, ctx, {
				...options.getPiCodexOptions(),
				getSkills: options.getSkills,
				refreshSkills: options.refreshSkills,
			}),
		getNotebookOptions: () => ({ agentDir: options.agentDir, ...options.getNotebookOptions() }),
		onPromotedCustomToolsAdded: options.onPromotedCustomToolsAdded,
	});
	const codeDefinitions = Object.fromEntries(
		createPublicCodeModeTools(codeMode).map((definition) => [definition.name, definition]),
	);
	codeDefinitions.notebook = eraseToolDefinition(createNotebookTool(codeMode));
	let shutdownPromise: Promise<void> | undefined;

	return {
		definitions: codeDefinitions,
		toolNames: (mode) => (mode === "notebook" ? NOTEBOOK_MODE_TOOL_NAMES : CODE_MODE_TOOL_NAMES),
		resolveExecutionMode: resolveCodexExecutionMode,
		activateExecutionMode: (mode) => codeMode.setExecutionKind(mode === "notebook" ? "notebook" : "code"),
		bindEvents: (events) => {
			codeMode.bindEvents(events);
			events.emit(PI_CODEX_EXEC_SESSIONS_CHANNEL, sessions);
		},
		buildCodeModePromptSection: (projectTrusted) => codeMode.buildPromptSection(projectTrusted),
		resetCodeModePromptTools: () => codeMode.resetPromptTools(),
		prepareCodeMode: () => codeMode.prepare(),
		checkpointNotebook: () => codeMode.checkpointNotebook(),
		shutdownCodeModeHost: () => codeMode.shutdownHost(),
		recordToolStart(toolCallId, toolName, args) {
			if (toolName !== "exec_command") {
				tracker.resetExplorationGroup();
				return;
			}
			if (!args || typeof args !== "object") return;
			const cmd = "cmd" in args ? args.cmd : undefined;
			if (typeof cmd === "string") tracker.recordStart(toolCallId, cmd);
		},
		recordToolEnd(toolCallId, toolName) {
			if (toolName === "exec_command") tracker.recordEnd(toolCallId);
		},
		resetExplorationGroup: () => tracker.resetExplorationGroup(),
		isErrorResult: (toolName, details) =>
			toolName === "exec" && Boolean(details && typeof details === "object" && "scriptError" in details),
		shutdown: () => {
			if (!shutdownPromise)
				shutdownPromise = (async () => {
					removeSessionExitListener();
					tracker.clear();
					await Promise.all([sessions.shutdown(), codeMode.shutdown()]);
				})();
			return shutdownPromise;
		},
	};
}
