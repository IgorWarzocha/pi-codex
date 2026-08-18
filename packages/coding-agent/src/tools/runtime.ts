import { type Api, type Model, supportsResponsesLiteModel } from "@earendil-works/pi-ai";
import type { EventBus } from "../core/event-bus.ts";
import type { ToolDefinition } from "../core/extensions/types.ts";
import { createApplyPatchTool, isApplyPatchToolDetails } from "./apply-patch/tool.ts";
import { createNativeCodeModeTools } from "./code-mode/native-tools.ts";
import { createNotebookTool } from "./code-mode/notebook-tool.ts";
import { createPublicCodeModeTools } from "./code-mode/public-tools.ts";
import { CodeModeRuntime } from "./code-mode/runtime.ts";
import { createExecCommandTracker } from "./exec/command-state.ts";
import { createExecCommandTool } from "./exec/command-tool.ts";
import { createExecSessionManager } from "./exec/session-manager.ts";
import { createWriteStdinTool } from "./exec/write-stdin-tool.ts";
import { createImageGenerationTool } from "./imagegen/tool.ts";
import { createViewImageTool } from "./view-image/tool.ts";
import { createWebSearchTool } from "./web-run/tool.ts";

export const NORMAL_CODEX_TOOL_NAMES = [
	"exec_command",
	"write_stdin",
	"apply_patch",
	"view_image",
	"web_run",
	"imagegen",
] as const;

export const CODE_MODE_TOOL_NAMES = ["exec", "wait"] as const;
export const NOTEBOOK_MODE_TOOL_NAMES = ["exec", "wait", "notebook"] as const;
export const DEFAULT_CODEX_TOOL_NAMES = NORMAL_CODEX_TOOL_NAMES;
export const ALL_CODEX_TOOL_NAMES = [...NORMAL_CODEX_TOOL_NAMES, ...NOTEBOOK_MODE_TOOL_NAMES] as const;

export type CodexExecutionMode = "normal" | "code" | "notebook";

export interface CodexToolRuntimeOptions {
	agentDir: string;
	cwd: string;
	getNotebookOptions(): {
		maxHeapMiB: number;
		profile?: string | undefined;
	};
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
	model: Model<Api> | undefined,
	requestedMode: CodexExecutionMode,
): CodexExecutionMode {
	if (requestedMode === "normal") return "normal";
	return model?.api === "openai-codex-responses" && supportsResponsesLiteModel(model) ? requestedMode : "normal";
}

export function createCodexToolRuntime(options: CodexToolRuntimeOptions): CodexToolRuntime {
	const tracker = createExecCommandTracker();
	const sessions = createExecSessionManager();
	const removeSessionExitListener = sessions.onSessionExit((sessionId) => tracker.recordSessionFinished(sessionId));
	const codeMode = new CodeModeRuntime({
		agentDir: options.agentDir,
		cwd: options.cwd,
		getTools: (ctx) => createNativeCodeModeTools(tracker, sessions, ctx),
		getNotebookOptions: () => ({ agentDir: options.agentDir, ...options.getNotebookOptions() }),
	});
	const normalDefinitions: Record<string, ToolDefinition> = {
		exec_command: eraseToolDefinition(createExecCommandTool(tracker, sessions, { showOutputWhenCollapsed: true })),
		write_stdin: eraseToolDefinition(createWriteStdinTool(sessions, { showOutputWhenCollapsed: true })),
		apply_patch: eraseToolDefinition(createApplyPatchTool({ showDiffWhenCollapsed: true })),
		view_image: eraseToolDefinition(createViewImageTool()),
		web_run: eraseToolDefinition(
			createWebSearchTool("web_run", {
				allowCodexProviderFallback: true,
				model: "gpt-5.6-luna",
			}),
		),
		imagegen: eraseToolDefinition(createImageGenerationTool({ allowCodexProviderFallback: true })),
	};
	const codeDefinitions = Object.fromEntries(
		createPublicCodeModeTools(codeMode).map((definition) => [definition.name, definition]),
	);
	codeDefinitions.notebook = eraseToolDefinition(createNotebookTool(codeMode));
	let shutdownPromise: Promise<void> | undefined;

	return {
		definitions: { ...normalDefinitions, ...codeDefinitions },
		toolNames: (mode) =>
			mode === "notebook"
				? NOTEBOOK_MODE_TOOL_NAMES
				: mode === "code"
					? CODE_MODE_TOOL_NAMES
					: NORMAL_CODEX_TOOL_NAMES,
		resolveExecutionMode: resolveCodexExecutionMode,
		activateExecutionMode: (mode) => codeMode.setExecutionKind(mode === "notebook" ? "notebook" : "code"),
		bindEvents: (events) => codeMode.bindEvents(events),
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
			(toolName === "apply_patch" && isApplyPatchToolDetails(details) && details.status === "partial_failure") ||
			(toolName === "exec" && Boolean(details && typeof details === "object" && "scriptError" in details)),
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
