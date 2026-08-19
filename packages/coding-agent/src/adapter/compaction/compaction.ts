import type { Api, Context, Model, ModelThinkingLevel, SimpleStreamOptions, Tool } from "@earendil-works/pi-ai";
import type { CodexDiagnosticsSink } from "@earendil-works/pi-ai/providers/openai-codex";
import type { CompactionPreparation, CompactionResult } from "../../core/compaction/index.ts";
import type { ModelRegistry } from "../../core/model-registry.ts";
import type { SessionEntry, SessionManager } from "../../core/session-manager.ts";
import { CODE_MODE_EXEC_GRAMMAR_INPUTS } from "../../tools/code-mode/exec-contract.ts";
import type { CodexConversionConfig } from "../activation/config.ts";
import {
	createNativeCompactionDetails,
	createNativeCompactionShimResult,
	NATIVE_COMPACTION_SHIM_SUMMARY,
	type NativeCompactionEntry,
} from "../compaction/types.ts";
import { isResponsesContext } from "../prompt/codex-model.ts";
import {
	rewriteResponsesPayloadWithNativeReplay,
	serializeLiveTailToResponsesInput,
} from "../replay/payload-rewrite.ts";
import {
	DEFAULT_SUPPORTED_PROVIDERS,
	isResponsesCompatiblePayload,
	type NativeCompactionModelContext,
	type ResponsesCompatibleRequestPayload,
	resolveNativeCompactionEnvironment,
} from "./compaction-runtime.ts";
import {
	findLatestNativeCompactionEntry,
	findLatestNativeCompactionEntryIndex,
	type LatestNativeCompactionResolution,
	resolveLatestNativeCompactionEntry,
} from "./details-store.ts";
import type { CodexCompactionDiagnostic } from "./diagnostics.ts";
import { executeRemoteCompactionV2, type NativeCompactionRequestControls } from "./remote-v2-client.ts";
import { buildRemoteCompactionV2Window } from "./remote-v2-history.ts";
import {
	type ResponsesInputItem,
	type SerializeResponsesMessagesOptions,
	serializeActiveSessionToResponsesInput,
} from "./serializer.ts";

export interface NativeCompactionState {
	config: CodexConversionConfig;
	activeProviderSystemPrompt?: string | undefined;
	pendingPiCompactionNativeWindow?:
		| {
				window: ResponsesInputItem[];
				provider: string;
				api: string;
				baseUrl: string;
				sessionId: string;
				sourceCompactionEntryId?: string | undefined;
		  }
		| undefined;
}

export interface NativeCompactionContext extends NativeCompactionModelContext {
	modelRegistry: ModelRegistry;
	sessionManager: SessionManager;
	systemPrompt: string;
	thinkingLevel: ModelThinkingLevel;
	tools: readonly Tool[];
	diagnostics?: CodexDiagnosticsSink | undefined;
	notify(message: string, level: "info" | "warning" | "error"): void;
}

export interface NativeCompactionRequest {
	preparation: CompactionPreparation;
	customInstructions?: string | undefined;
	reason: "manual" | "threshold" | "overflow";
	willRetry: boolean;
	signal: AbortSignal;
}

export type NativeCompactionDecision = { cancel: true } | { compaction: CompactionResult } | undefined;

function nativeCompactionEnabled(ctx: NativeCompactionContext, state: NativeCompactionState): boolean {
	return (
		state.config.compaction.responsesCompaction && ctx.model?.provider === "openai-codex" && isResponsesContext(ctx)
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function stashLatestNativeWindowForPiCompactionFallback(
	ctx: NativeCompactionContext,
	branchEntries: SessionEntry[],
	runtime: { provider: string; api: string; baseUrl: string },
	state: NativeCompactionState,
): boolean {
	state.pendingPiCompactionNativeWindow = undefined;
	const nativeEntry = findLatestNativeCompactionEntry(branchEntries, {
		provider: runtime.provider,
		api: runtime.api,
		baseUrl: runtime.baseUrl,
	});
	const compactedWindow = cloneCompactedWindow(nativeEntry?.details?.compactedWindow ?? []);
	if (!compactedWindow || compactedWindow.length === 0) return false;
	state.pendingPiCompactionNativeWindow = {
		window: compactedWindow,
		provider: runtime.provider,
		api: runtime.api,
		baseUrl: runtime.baseUrl,
		sessionId: ctx.sessionManager.getSessionId(),
		sourceCompactionEntryId: nativeEntry?.id,
	};
	return true;
}

function cloneCompactedWindow(window: readonly unknown[]): ResponsesInputItem[] | undefined {
	if (!window.every(isRecord)) return undefined;
	return window.map((item) => structuredClone(item));
}

function buildCompactionReasoning(
	ctx: NativeCompactionContext,
	compactionTargetModel: Model<Api>,
): SimpleStreamOptions["reasoning"] {
	const level = ctx.thinkingLevel;
	if (!compactionTargetModel.reasoning || level === "off") return undefined;
	return level;
}

function buildCompactionRequestOptions(
	ctx: NativeCompactionContext,
	state: NativeCompactionState,
	compactionTargetModel: Model<Api>,
): NativeCompactionRequestControls {
	const reasoning = buildCompactionReasoning(ctx, compactionTargetModel);
	return {
		...(ctx.model?.provider === "openai-codex" && state.config.openai.fast ? { serviceTier: "priority" } : {}),
		textVerbosity: state.config.openai.verbosity,
		...(reasoning ? { reasoning } : {}),
	};
}

function notifyNativeCompactionFallback(
	ctx: NativeCompactionContext,
	state: NativeCompactionState,
	branchEntries: SessionEntry[],
	runtime: { provider: string; api: string; baseUrl: string },
	message: string,
): void {
	const stashed = stashLatestNativeWindowForPiCompactionFallback(ctx, branchEntries, runtime, state);
	ctx.notify(
		`${message}; Pi compaction will run.${stashed ? " Previous native compacted window will be included in Pi compaction fallback." : ""}`,
		"error",
	);
}

function textFromResponsesContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((item) =>
			isRecord(item) && item["type"] === "input_text" && typeof item["text"]! === "string" ? item["text"]! : "",
		)
		.join("\n");
}

function isPiCompactionSummarizationPayload(payload: ResponsesCompatibleRequestPayload): boolean {
	const instructions = typeof payload.instructions === "string" ? payload.instructions : "";
	if (/compact|summar/i.test(instructions)) return true;

	return payload.input.some((item) => {
		if (!isRecord(item)) return false;
		const role = item["role"]!;
		const text = textFromResponsesContent(item["content"]!);
		if ((role === "system" || role === "developer") && /compact|summar/i.test(text)) return true;
		if (role === "user" && /<conversation>|previous compaction summary|summary/i.test(text)) return true;
		return false;
	});
}

function getSupportedNativeCompactionProviders(_state: NativeCompactionState): string[] {
	return [...DEFAULT_SUPPORTED_PROVIDERS];
}

export function buildNativeCompactionInput(args: {
	model: Model<Api>;
	branchEntries: SessionEntry[];
	allEntries: SessionEntry[];
	leafId?: string | null | undefined;
	latestNativeCompaction: LatestNativeCompactionResolution;
	serializationOptions?: SerializeResponsesMessagesOptions | undefined;
}): { input: ResponsesInputItem[]; compactedKeptWindow: boolean } | undefined {
	if (args.latestNativeCompaction.ok) {
		const compactedWindow = cloneCompactedWindow(args.latestNativeCompaction.entry.details?.compactedWindow ?? []);
		if (!compactedWindow) return undefined;
		const liveTailEntries = args.branchEntries.slice(args.latestNativeCompaction.index + 1);
		return {
			input: [
				...compactedWindow,
				...serializeLiveTailToResponsesInput({
					model: args.model,
					entries: liveTailEntries,
					serializationOptions: args.serializationOptions,
				}),
			],
			compactedKeptWindow: false,
		};
	}

	return {
		input: serializeActiveSessionToResponsesInput({
			model: args.model,
			entries: args.allEntries,
			leafId: args.leafId,
			options: args.serializationOptions,
		}),
		compactedKeptWindow: true,
	};
}

export async function handleCodexSessionBeforeCompact(
	event: NativeCompactionRequest,
	ctx: NativeCompactionContext,
	state: NativeCompactionState,
): Promise<NativeCompactionDecision> {
	if (!nativeCompactionEnabled(ctx, state)) {
		return undefined;
	}

	try {
		return await handleCodexSessionBeforeCompactInner(event, ctx, state);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		ctx.notify(`OpenAI native compaction failed unexpectedly: ${message}; Pi compaction was not run.`, "error");
		return { cancel: true };
	}
}

async function handleCodexSessionBeforeCompactInner(
	event: NativeCompactionRequest,
	ctx: NativeCompactionContext,
	state: NativeCompactionState,
): Promise<NativeCompactionDecision> {
	if (!nativeCompactionEnabled(ctx, state)) {
		ctx.notify(
			"OpenAI native compaction is enabled, but the current model is not Responses-compatible; Pi compaction was not run.",
			"error",
		);
		return { cancel: true };
	}
	if (event.signal.aborted) return { cancel: true };

	const resolution = await resolveNativeCompactionEnvironment(ctx, {
		enabled: true,
		supportedProviders: getSupportedNativeCompactionProviders(state),
	});
	if (!resolution.ok) {
		if (resolution.reason === "unsupported-provider" || resolution.reason === "unsupported-api") {
			return undefined;
		}
		ctx.notify(
			`OpenAI native compaction is enabled but unavailable (${resolution.reason}); Pi compaction was not run.`,
			"error",
		);
		return { cancel: true };
	}

	const runtime = resolution.runtime;
	const compactionTargetModel = runtime.currentModel;
	const serializationOptions = { grammarToolInputProperties: CODE_MODE_EXEC_GRAMMAR_INPUTS };
	const requestOptions = buildCompactionRequestOptions(ctx, state, compactionTargetModel);
	const branchEntries = ctx.sessionManager.getBranch();
	const latestNativeCompaction = resolveLatestNativeCompactionEntry(branchEntries, {
		provider: runtime.provider,
		api: runtime.api,
		baseUrl: runtime.baseUrl,
	});
	if (!latestNativeCompaction.ok && latestNativeCompaction.reason === "latest-native-compaction-mismatch") {
		ctx.notify(
			"OpenAI native compaction cannot reuse the latest checkpoint with this provider or endpoint; compaction was cancelled to preserve its encrypted history.",
			"error",
		);
		return { cancel: true };
	}
	const builtInput = buildNativeCompactionInput({
		model: compactionTargetModel,
		branchEntries,
		allEntries: ctx.sessionManager.getEntries(),
		leafId: ctx.sessionManager.getLeafId(),
		latestNativeCompaction,
		serializationOptions,
	});
	if (!builtInput) {
		ctx.notify(
			"OpenAI native compaction could not clone the previous compacted window; Pi compaction was not run.",
			"error",
		);
		return { cancel: true };
	}
	const input = builtInput.input;
	const { compactedKeptWindow } = builtInput;
	const compactionDiagnostic: CodexCompactionDiagnostic = {
		model: runtime.model,
		inputSource: "reconstructed",
		canonicalReplay: "not_applicable",
		checkpointReused: latestNativeCompaction.ok,
		...(latestNativeCompaction.ok && latestNativeCompaction.entry.details?.model
			? { checkpointModel: latestNativeCompaction.entry.details.model }
			: {}),
	};

	if (input.length === 0) {
		ctx.notify(
			"OpenAI native compaction had no serializable conversation items; Pi compaction was not run.",
			"error",
		);
		return { cancel: true };
	}
	if (event.customInstructions?.trim()) {
		ctx.notify(
			"Responses compaction v2 uses the active session instructions and ignores custom /compact guidance.",
			"warning",
		);
	}
	const tools = ctx.tools;
	const context: Context = {
		// Match the active provider lane so cached WebSocket compaction can send
		// only previous_response_id plus the trigger instead of the full history.
		systemPrompt: state.activeProviderSystemPrompt ?? ctx.systemPrompt,
		messages: [],
		...(tools.length > 0 ? { tools: [...tools] } : {}),
	};
	const compactResult = await executeRemoteCompactionV2({
		runtime,
		modelRegistry: ctx.modelRegistry,
		context,
		promptInput: input,
		promptInputSource: runtime.codexTransport ? undefined : "reconstructed",
		compactionDiagnostic,
		diagnostics: ctx.diagnostics,
		requestOptions,
		tokensBefore: event.preparation.tokensBefore,
		sessionId: ctx.sessionManager.getSessionId(),
		signal: event.signal,
	});
	if (!compactResult.ok) {
		if (compactResult.reason !== "aborted") {
			notifyNativeCompactionFallback(
				ctx,
				state,
				branchEntries,
				runtime,
				`Responses compaction v2 failed (${compactResult.reason}): ${compactResult.errorMessage}`,
			);
		}
		return compactResult.reason === "aborted" ? { cancel: true } : undefined;
	}
	const compactedWindow = buildRemoteCompactionV2Window(
		compactResult.promptInput,
		compactResult.compaction,
		state.config.compaction.v2UserMessageRetention * 1_000,
	);
	try {
		const details = createNativeCompactionDetails({
			provider: runtime.provider,
			api: runtime.api,
			model: runtime.model,
			baseUrl: runtime.baseUrl,
			compactedWindow,
			compactResponseId: compactResult.responseId,
			createdAt: compactResult.createdAt,
			usage: compactResult.usage,
			requestMeta: {
				tokensBefore: event.preparation.tokensBefore,
				previousSummaryPresent: Boolean(event.preparation.previousSummary),
				compactedKeptWindow,
			},
		});
		return {
			compaction: createNativeCompactionShimResult({
				summary: NATIVE_COMPACTION_SHIM_SUMMARY,
				firstKeptEntryId: event.preparation.firstKeptEntryId,
				tokensBefore: event.preparation.tokensBefore,
				details,
			}),
		};
	} catch {
		notifyNativeCompactionFallback(
			ctx,
			state,
			branchEntries,
			runtime,
			"Responses compaction v2 produced details Pi could not store",
		);
		return undefined;
	}
}

export async function rewriteCodexCompactedProviderRequest(
	payload: unknown,
	ctx: NativeCompactionContext,
	state: NativeCompactionState,
): Promise<unknown | undefined> {
	if (!nativeCompactionEnabled(ctx, state)) return undefined;
	const resolution = await resolveNativeCompactionEnvironment(
		ctx,
		{ enabled: true, supportedProviders: getSupportedNativeCompactionProviders(state) },
		payload,
	);
	if (!resolution.ok) return undefined;
	const runtime = resolution.runtime;
	const branchEntries = ctx.sessionManager.getBranch();
	const latestNativeCompactionIndex = findLatestNativeCompactionEntryIndex(branchEntries, {
		provider: runtime.provider,
		api: runtime.api,
		baseUrl: runtime.baseUrl,
	});
	if (latestNativeCompactionIndex === undefined) return undefined;
	if (!runtime.payload) return undefined;
	const compactionEntry = branchEntries[latestNativeCompactionIndex]! as NativeCompactionEntry;
	const rewrite = rewriteResponsesPayloadWithNativeReplay({
		model: runtime.currentModel,
		payload: runtime.payload,
		branchEntries,
		compactionEntry,
		serializationOptions: { grammarToolInputProperties: CODE_MODE_EXEC_GRAMMAR_INPUTS },
	});
	if (rewrite.ok) return rewrite.rewrittenPayload;
	const detail = rewrite.parity?.mismatches.slice(0, 3).join("; ");
	const message = `OpenAI native compaction replay failed (${rewrite.reason})${detail ? `: ${detail}` : ""}; request was not sent with placeholder compaction context.`;
	ctx.notify(message, "error");
	throw new Error(message);
}

export async function injectPendingNativeWindowIntoPiCompactionRequest(
	payload: unknown,
	ctx: NativeCompactionContext,
	state: NativeCompactionState,
): Promise<unknown | undefined> {
	const pending = state.pendingPiCompactionNativeWindow;
	if (!pending || pending.window.length === 0) return undefined;
	if (!isResponsesCompatiblePayload(payload)) return undefined;
	if (pending.sessionId !== ctx.sessionManager.getSessionId()) {
		state.pendingPiCompactionNativeWindow = undefined;
		return undefined;
	}
	if (!isPiCompactionSummarizationPayload(payload)) return undefined;

	const resolution = await resolveNativeCompactionEnvironment(
		ctx,
		{ enabled: true, supportedProviders: getSupportedNativeCompactionProviders(state) },
		payload,
	);
	if (!resolution.ok) return undefined;
	const runtime = resolution.runtime;
	if (pending.provider !== runtime.provider || pending.api !== runtime.api || pending.baseUrl !== runtime.baseUrl) {
		state.pendingPiCompactionNativeWindow = undefined;
		return undefined;
	}

	const input = [...payload.input];
	let insertAt = 0;
	while (insertAt < input.length) {
		const item = input[insertAt]!;
		if (!isRecord(item) || (item["role"] !== "system" && item["role"] !== "developer")) break;
		insertAt++;
	}

	state.pendingPiCompactionNativeWindow = undefined;
	return {
		...payload,
		input: [
			...input.slice(0, insertAt),
			...pending.window.map((item) => structuredClone(item)),
			...input.slice(insertAt),
		],
	};
}
