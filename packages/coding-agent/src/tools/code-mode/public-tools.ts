import { Type } from "typebox";
import type { ToolDefinition } from "../../core/extensions/types.ts";
import { getExperimentalToolSampling } from "../tool-sampling.ts";
import { renderExecCall, renderWaitCall } from "./call-rendering.ts";
import { EXEC_DESCRIPTION, WAIT_DESCRIPTION } from "./custom-tool-prompt.ts";
import { CODE_MODE_EXEC_CONSTRAINED_SAMPLING } from "./exec-contract.ts";
import { DEFAULT_CODE_MODE_OUTPUT_TOKENS, MAX_CODE_MODE_OUTPUT_TOKENS } from "./host-protocol.ts";
import type { CodeModeToolPreflightRunner } from "./nested-tool-preflight.ts";
import { runCodeModeToolPreflight } from "./nested-tool-preflight.ts";
import { createCodeModeRenderTracker } from "./render-tracker.ts";
import { renderTrackedCodeModeResult } from "./result-rendering.ts";
import type { CodeModeExecutionClient } from "./runtime.ts";
import { formatRunningExecSessionGuidance, toCodeModeToolResult } from "./tool-result.ts";
import type {
	CodeModeRenderContext,
	CodeModeRenderTheme,
	CodeModeToolDefinition,
	ToolExecutionContext,
} from "./types.ts";

const DEFAULT_WAIT_MS = 10_000;
const MIN_ADAPTIVE_WAIT_MS = 5_000;
const MAX_ADAPTIVE_WAIT_MS = 1_800_000;
type RenderTracker = ReturnType<typeof createCodeModeRenderTracker>;
const EXEC_PARAMETERS = Type.Object({
	code: Type.String(),
});
const WAIT_PARAMETERS = Type.Object({
	cell_id: Type.String(),
	yield_time_ms: Type.Optional(
		Type.Integer({
			minimum: 0,
			default: DEFAULT_WAIT_MS,
		}),
	),
	max_tokens: Type.Optional(
		Type.Integer({
			minimum: 1,
			maximum: MAX_CODE_MODE_OUTPUT_TOKENS,
			default: DEFAULT_CODE_MODE_OUTPUT_TOKENS,
		}),
	),
	terminate: Type.Optional(Type.Boolean()),
});

export interface PublicCodeModeRuntime {
	getClient(): Promise<CodeModeExecutionClient>;
	collectTools(ctx?: unknown): CodeModeToolDefinition[];
	collectRenderTools(): CodeModeToolDefinition[];
	useRichRendering(): boolean;
	preflight: CodeModeToolPreflightRunner;
}

export function createPublicCodeModeTools(runtime: PublicCodeModeRuntime): ToolDefinition[] {
	const tracker = createCodeModeRenderTracker();
	const waitAttempts = new Map<string, number>();
	const renderResult = createResultRenderer(runtime, tracker);
	return [
		eraseToolDefinition(createExecTool(runtime, tracker, renderResult, runtime.preflight)),
		eraseToolDefinition(createWaitTool(runtime, tracker, renderResult, waitAttempts, runtime.preflight)),
	];
}

function eraseToolDefinition(definition: unknown): ToolDefinition {
	return definition as ToolDefinition;
}

function createExecTool(
	runtime: PublicCodeModeRuntime,
	tracker: RenderTracker,
	renderResult: ReturnType<typeof createResultRenderer>,
	preflight: NonNullable<ToolExecutionContext["preflight"]>,
): ToolDefinition<typeof EXEC_PARAMETERS> {
	return {
		name: "exec",
		label: "Exec",
		description: EXEC_DESCRIPTION,
		promptSnippet: "Compose tools with JavaScript",
		parameters: EXEC_PARAMETERS,
		constrainedSampling: CODE_MODE_EXEC_CONSTRAINED_SAMPLING,
		async execute(id, params, signal, onUpdate, ctx) {
			tracker.start(id);
			try {
				const response = await (await runtime.getClient()).execute(
					params.code,
					{ cwd: ctx.cwd, toolCallId: id, extensionContext: ctx, preflight, onUpdate },
					signal,
					runtime.collectTools(ctx),
				);
				tracker.finish(id, response.kind === "yielded" ? "yielded" : "done");
				return toCodeModeToolResult(response);
			} catch (error) {
				tracker.finish(id);
				throw error;
			}
		},
		renderCall: (args, theme, context) => renderExecCall(args, theme, context, tracker, runtime.useRichRendering()),
		renderResult,
	};
}

function createWaitTool(
	runtime: PublicCodeModeRuntime,
	tracker: RenderTracker,
	renderResult: ReturnType<typeof createResultRenderer>,
	waitAttempts: Map<string, number>,
	preflight: NonNullable<ToolExecutionContext["preflight"]>,
): ToolDefinition<typeof WAIT_PARAMETERS> {
	const constrainedSampling = getExperimentalToolSampling("wait");
	return {
		name: "wait",
		label: "Wait",
		description: WAIT_DESCRIPTION,
		promptSnippet: "Resume or terminate an exec cell",
		parameters: WAIT_PARAMETERS,
		...(constrainedSampling ? { constrainedSampling } : {}),
		async execute(id, params, signal, onUpdate, ctx) {
			tracker.start(id);
			try {
				const client = await runtime.getClient();
				const context = { cwd: ctx.cwd, toolCallId: id, extensionContext: ctx, preflight, onUpdate };
				const attempt = waitAttempts.get(params.cell_id) ?? 0;
				const response = params.terminate
					? await client.terminate(params.cell_id, context, signal)
					: await client.wait(
							params.cell_id,
							adaptiveWaitMs(params.yield_time_ms ?? DEFAULT_WAIT_MS, attempt),
							context,
							signal,
						);
				const recovered =
					!params.terminate && response.missingCell === true
						? await continueExecSessionFromMistakenWait(
								params.cell_id,
								params.yield_time_ms ?? DEFAULT_WAIT_MS,
								params.max_tokens,
								runtime,
								context,
								signal,
							)
						: undefined;
				if (recovered) {
					waitAttempts.delete(params.cell_id);
					tracker.finish(id, recovered.running ? "yielded" : "done");
					return recovered.result;
				}
				if (response.kind === "yielded") waitAttempts.set(params.cell_id, attempt + 1);
				else waitAttempts.delete(params.cell_id);
				tracker.finish(id, response.kind === "yielded" ? "yielded" : "done");
				return toCodeModeToolResult(response, params.max_tokens);
			} catch (error) {
				waitAttempts.delete(params.cell_id);
				tracker.finish(id);
				throw error;
			}
		},
		renderCall: (args, theme, context) => renderWaitCall(args, theme, context, tracker, runtime.useRichRendering()),
		renderResult,
	};
}

async function continueExecSessionFromMistakenWait(
	cellId: string,
	yieldTimeMs: number,
	maxOutputTokens: number | undefined,
	runtime: PublicCodeModeRuntime,
	context: ToolExecutionContext,
	signal?: AbortSignal,
): Promise<
	| {
			running: boolean;
			result: {
				content: Array<{ type: "text"; text: string }>;
				details: unknown;
			};
	  }
	| undefined
> {
	if (!/^\d+$/.test(cellId)) return undefined;
	const sessionId = Number(cellId);
	if (!Number.isSafeInteger(sessionId) || String(sessionId) !== cellId) return undefined;
	const writeStdin = runtime
		.collectTools(context.extensionContext)
		.find((tool) => tool.name === "write_stdin" && "invoke" in tool);
	if (!writeStdin || !("invoke" in writeStdin)) return undefined;
	const input = {
		session_id: sessionId,
		yield_time_ms: yieldTimeMs,
		...(maxOutputTokens === undefined ? {} : { max_output_tokens: maxOutputTokens }),
	};
	const nestedSignal = signal ?? new AbortController().signal;
	await runCodeModeToolPreflight(writeStdin.name, input, context, nestedSignal);
	nestedSignal.throwIfAborted();
	let value: unknown;
	try {
		value = await writeStdin.invoke(input, context, nestedSignal);
	} catch (fallbackError) {
		const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
		if (/unknown process id/i.test(fallbackMessage)) return undefined;
		throw fallbackError;
	}
	if (!value || typeof value !== "object" || !("output" in value)) return undefined;
	const output = typeof value.output === "string" ? value.output : "";
	const exitCode = "exit_code" in value && typeof value.exit_code === "number" ? value.exit_code : undefined;
	const running = "session_id" in value && typeof value.session_id === "number";
	return {
		running,
		result: {
			content: [
				{
					type: "text",
					text: `Recovered wait cell_id ${cellId} as exec_command session_id ${sessionId} and continued it with write_stdin`,
				},
				...(output ? [{ type: "text" as const, text: output }] : []),
				...(exitCode === undefined
					? []
					: [
							{
								type: "text" as const,
								text: `Process exited with code ${exitCode}`,
							},
						]),
				...(running
					? [
							{
								type: "text" as const,
								text: formatRunningExecSessionGuidance(sessionId),
							},
						]
					: []),
			],
			details: value,
		},
	};
}

function adaptiveWaitMs(requestedMs: number, previousIncompleteWaits: number): number {
	const multiplier = 2 ** previousIncompleteWaits;
	const grown = requestedMs * multiplier * 2;
	const adaptive = Math.min(MAX_ADAPTIVE_WAIT_MS, Math.max(MIN_ADAPTIVE_WAIT_MS * multiplier, grown));
	return Math.max(requestedMs, adaptive);
}

function createResultRenderer(runtime: PublicCodeModeRuntime, tracker: RenderTracker) {
	return (
		result: Parameters<typeof renderTrackedCodeModeResult>[0],
		options: Parameters<typeof renderTrackedCodeModeResult>[1],
		theme: CodeModeRenderTheme,
		context: CodeModeRenderContext,
	) =>
		renderTrackedCodeModeResult(
			result,
			options,
			theme,
			context,
			tracker,
			runtime.collectRenderTools(),
			runtime.useRichRendering(),
		);
}
