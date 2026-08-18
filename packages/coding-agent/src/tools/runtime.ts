import type { ToolDefinition } from "../core/extensions/types.ts";
import { createApplyPatchTool, isApplyPatchToolDetails } from "./apply-patch/tool.ts";
import { createExecCommandTracker } from "./exec/command-state.ts";
import { createExecCommandTool } from "./exec/command-tool.ts";
import { createExecSessionManager } from "./exec/session-manager.ts";
import { createWriteStdinTool } from "./exec/write-stdin-tool.ts";
import { createImageGenerationTool } from "./imagegen/tool.ts";
import { createViewImageTool } from "./view-image/tool.ts";
import { createWebSearchTool } from "./web-run/tool.ts";

export const DEFAULT_CODEX_TOOL_NAMES = [
	"exec_command",
	"write_stdin",
	"apply_patch",
	"view_image",
	"web_run",
	"imagegen",
] as const;

export interface CodexToolRuntime {
	definitions: Record<string, ToolDefinition>;
	recordToolStart(toolCallId: string, toolName: string, args: unknown): void;
	recordToolEnd(toolCallId: string, toolName: string): void;
	resetExplorationGroup(): void;
	isErrorResult(toolName: string, details: unknown): boolean;
	shutdown(): Promise<void>;
}

function eraseToolDefinition(definition: unknown): ToolDefinition {
	return definition as ToolDefinition;
}

export function createCodexToolRuntime(): CodexToolRuntime {
	const tracker = createExecCommandTracker();
	const sessions = createExecSessionManager();
	const removeSessionExitListener = sessions.onSessionExit((sessionId) => tracker.recordSessionFinished(sessionId));
	let shutdownPromise: Promise<void> | undefined;

	return {
		definitions: {
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
		},
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
			toolName === "apply_patch" && isApplyPatchToolDetails(details) && details.status === "partial_failure",
		shutdown: () => {
			if (!shutdownPromise)
				shutdownPromise = (async () => {
					removeSessionExitListener();
					tracker.clear();
					await sessions.shutdown();
				})();
			return shutdownPromise;
		},
	};
}
