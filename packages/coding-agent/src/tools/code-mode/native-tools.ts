import type { AgentToolResult, ExtensionContext } from "../../core/extensions/types.ts";
import { createApplyPatchTool } from "../apply-patch/tool.ts";
import type { ExecCommandTracker } from "../exec/command-state.ts";
import { createExecCommandTool } from "../exec/command-tool.ts";
import type { ExecSessionManager } from "../exec/session-manager.ts";
import { createWriteStdinTool } from "../exec/write-stdin-tool.ts";
import { createImageGenerationTool } from "../imagegen/tool.ts";
import { createViewImageTool } from "../view-image/tool.ts";
import { createWebSearchTool } from "../web-run/tool.ts";
import { codeModeImageResult, codeModeWebResult, toNestedTool } from "./nested-tool-adapter.ts";
import { formatRunningExecSessionGuidance } from "./tool-result.ts";
import type { ProgrammaticCodeModeToolDefinition } from "./types.ts";

const LONG_RUNNING_TOOL_OUTER_YIELD_MS = 1_800_000;

export function createNativeCodeModeTools(
	tracker: ExecCommandTracker,
	sessions: ExecSessionManager,
	_ctx?: ExtensionContext,
): ProgrammaticCodeModeToolDefinition[] {
	const options = {
		promptSnippet: false,
		customRendering: true,
		showOutputWhenCollapsed: true,
	};
	return [
		toNestedTool(
			createApplyPatchTool({
				promptSnippet: false,
				showDiffWhenCollapsed: true,
			}),
			"await tools.apply_patch(patch) // *** Begin Patch / *** End Patch; actions: *** Add File: path | *** Update File: path | *** Delete File: path; *** Move to: path must immediately follow its Update File header and still needs a nonempty @@ hunk (use one unchanged context line for a pure move); Update hunks MUST follow file order; copy exact context; @@ text is context, not a line range; reread a file before patching if it changed since your last read",
			{},
			{
				kind: "freeform",
				prepareInput(input) {
					if (typeof input !== "string") throw new Error("apply_patch expects a patch string");
					return { input };
				},
				resultError(result) {
					if (
						result.details &&
						typeof result.details === "object" &&
						"status" in result.details &&
						result.details.status === "partial_failure"
					)
						return (
							result.content
								.filter((item) => item.type === "text")
								.map((item) => item.text)
								.join("\n") || "apply_patch partially failed"
						);
					return undefined;
				},
			},
		),
		toNestedTool(
			createExecCommandTool(tracker, sessions, options),
			"await tools.exec_command({ cmd: string, workdir?: string, shell?: string, tty?: boolean, yield_time_ms?: number, max_output_tokens?: number, login?: boolean }) // returns { output: string, session_id?: number, exit_code?: number }",
			{
				start(id, input) {
					const cmd =
						input && typeof input === "object" && "cmd" in input && typeof input.cmd === "string"
							? input.cmd
							: "";
					if (cmd) tracker.recordStart(id, cmd);
				},
				end: (id) => tracker.recordEnd(id),
			},
			{
				yieldTimeMs: LONG_RUNNING_TOOL_OUTER_YIELD_MS,
				resultValue(result) {
					const details = result.details;
					if (result.content.some((item) => item.type === "image")) {
						const outputHint = isExecResult(details)
							? details.output
							: result.content
									.filter((item) => item.type === "text")
									.map((item) => item.text)
									.join("\n") || undefined;
						return codeModeImageResult(result, outputHint);
					}
					if (isRunningExecResult(details))
						return {
							...details,
							continuation: formatRunningExecSessionGuidance(details.session_id),
						};
					if (isExecResult(details)) return details;
					return (
						result.content
							.filter((item): item is { type: "text"; text: string } => item.type === "text")
							.map((item) => item.text)
							.join("\n") || "(no output)"
					);
				},
			},
		),
		toNestedTool(
			createWriteStdinTool(sessions, options),
			"await tools.write_stdin({ session_id: number, chars?: string, yield_time_ms?: number, max_output_tokens?: number })",
			{},
			{ yieldTimeMs: LONG_RUNNING_TOOL_OUTER_YIELD_MS },
		),
		toNestedTool(
			createViewImageTool({ promptSnippet: false, customRendering: true }),
			'const result = await tools.view_image({ path: string, detail?: "original" }); image(result)',
			{},
			{ resultValue: codeModeImageResult },
		),
		toNestedTool(
			createWebSearchTool("web__run", {
				allowCodexProviderFallback: true,
				model: "gpt-5.6-luna",
				promptSnippet: false,
				customRendering: true,
			}),
			'await tools.web__run({ search_query?: [{ q: string, recency?: number, domains?: string[] }], image_query?: [{ q: string }], open?: [{ ref_id: string, lineno?: number }], click?: [{ ref_id: string, id: number }], find?: [{ ref_id: string, pattern: string }], response_length?: "short" | "medium" | "long" }) // turn… ref_ids only for web__run; final answers cite result URLs with Markdown links, never turn… or cite…',
			{},
			{ toolName: { namespace: "web", name: "run" }, resultValue: codeModeWebResult },
		),
		toNestedTool(
			{
				...createImageGenerationTool({
					allowCodexProviderFallback: true,
					promptSnippet: false,
					customRendering: true,
				}),
				name: "image_gen__imagegen",
				label: "image_gen__imagegen",
			},
			'await tools.image_gen__imagegen({ prompt: string, action?: "generate" | "edit", images?: string[] })',
			{},
			{
				toolName: { namespace: "image_gen", name: "imagegen" },
				resultValue(result) {
					const outputHint =
						result.content
							.filter((item) => item.type === "text")
							.map((item) => item.text)
							.join("\n") || undefined;
					return codeModeImageResult(result, outputHint);
				},
			},
		),
	];
}

function isRunningExecResult(
	details: AgentToolResult<unknown>["details"],
): details is Record<string, unknown> & { session_id: number } {
	return Boolean(
		details && typeof details === "object" && "session_id" in details && typeof details.session_id === "number",
	);
}

function isExecResult(
	details: AgentToolResult<unknown>["details"],
): details is Record<string, unknown> & { output: string } {
	return Boolean(details && typeof details === "object" && "output" in details && typeof details.output === "string");
}
