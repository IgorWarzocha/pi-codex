import { clampThinkingLevel } from "../models.ts";
import { registerSessionResourceCleanup } from "../session-resources.ts";
import type { Api, Context, Model, SimpleStreamOptions, StreamFunction } from "../types.ts";
import { createGrammarToolInputProperties } from "./constrained-sampling.ts";
import { withRemoteCompactionV2Feature } from "./openai-codex/compaction-v2-feature.ts";
import { noThrowCodexDiagnosticsSink } from "./openai-codex/diagnostic-failure.ts";
import {
	buildWebSocketHeaders,
	extractAccountId,
	PI_CODEX_CONVERSION_ORIGINATOR,
	resolveCodexRequestRouting,
	resolveCodexWebSocketUrl,
} from "./openai-codex/headers.ts";
import { buildRequestBody } from "./openai-codex/request-body.ts";
import {
	applyResponsesLiteRequest,
	applyResponsesLiteWebSocketMetadata,
	isResponsesLiteRequest,
	namespaceExistingResponsesLiteRequest,
	prepareResponsesLiteRequestImages,
} from "./openai-codex/responses-lite.ts";
import { supportsResponsesLiteModel } from "./openai-codex/responses-lite-model.ts";
import { normalizeResponsesToolHistory } from "./openai-codex/responses-tool-history.ts";
import { createCodexTransportStream, getEffectiveCodexTransport } from "./openai-codex/transport-recovery.ts";
import { createCodexTurnState, withCodexTurnState } from "./openai-codex/turn-state.ts";
import type { CodexPrewarmResult, OpenAICodexStreamOptions, ResponsesBody } from "./openai-codex/types.ts";
import {
	closeOpenAICodexWebSocketSessions,
	getOpenAICodexWebSocketDebugStats,
	type OpenAICodexWebSocketDebugStats,
	recordWebSocketSseFallback,
	resetOpenAICodexWebSocketDebugStats,
} from "./openai-codex/websocket.ts";
import { isWebSocketMessageTooBigError, isWebSocketUpgradeRequiredError } from "./openai-codex/websocket-connection.ts";
import { prewarmWebSocket } from "./openai-codex/websocket-stream.ts";
import { clampOpenAIPromptCacheKey } from "./openai-prompt-cache.ts";
import { buildBaseOptions } from "./simple-options.ts";

export interface OpenAICodexResponsesOptions extends OpenAICodexStreamOptions {}

function normalizeSessionOptions(
	options: OpenAICodexResponsesOptions | undefined,
): OpenAICodexResponsesOptions | undefined {
	if (!options) return undefined;
	const sessionId = options.cacheRetention === "none" ? undefined : clampOpenAIPromptCacheKey(options.sessionId);
	return {
		...options,
		sessionId,
		serviceTier: options.serviceTier ?? (options.fast ? "priority" : undefined),
		turnState: options.turnState ?? createCodexTurnState(),
	};
}

async function prepareCodexRequestBody<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options: OpenAICodexStreamOptions | undefined,
	responsesLite: boolean,
): Promise<ResponsesBody> {
	let body = buildRequestBody(model, context, options);
	const nextBody = await options?.onPayload?.(body, model);
	if (nextBody !== undefined) body = nextBody as ResponsesBody;
	if (responsesLite) {
		body = isResponsesLiteRequest(body)
			? namespaceExistingResponsesLiteRequest({ ...body, parallel_tool_calls: false })
			: applyResponsesLiteRequest(body);
		body = await prepareResponsesLiteRequestImages(body);
	}
	if (!body.previous_response_id) {
		const input = normalizeResponsesToolHistory(body.input);
		if (input !== body.input) body = { ...body, input };
	}
	return body;
}

export const stream: StreamFunction<"openai-codex-responses", OpenAICodexResponsesOptions> = (
	model,
	context,
	options,
) =>
	createCodexTransportStream(model, context, normalizeSessionOptions(options), {
		prepareRequestBody: prepareCodexRequestBody,
	});

export const streamSimple: StreamFunction<"openai-codex-responses", SimpleStreamOptions> = (
	model,
	context,
	options,
) => {
	const apiKey = options?.apiKey;
	if (!apiKey) throw new Error(`No API key for provider: ${model.provider}`);
	const advanced = options as (SimpleStreamOptions & Partial<OpenAICodexResponsesOptions>) | undefined;

	const base = {
		...buildBaseOptions(model, context, options, apiKey),
		toolChoice: options?.toolChoice,
		serviceTier: advanced?.serviceTier,
		textVerbosity: advanced?.textVerbosity,
		reasoningSummary: advanced?.reasoningSummary,
		responsesLite: advanced?.responsesLite,
		executionMode: advanced?.executionMode,
		forceCachedWebSockets: advanced?.forceCachedWebSockets,
		fast: advanced?.fast,
		responsesCompaction: advanced?.responsesCompaction,
		harnessIdentifierHeader: advanced?.harnessIdentifierHeader,
		onOutputItemDone: advanced?.onOutputItemDone,
		onPreparedPayload: advanced?.onPreparedPayload,
		onStreamSettled: advanced?.onStreamSettled,
		turnState: advanced?.turnState,
		diagnostics: advanced?.diagnostics,
		canonicalCompaction: advanced?.canonicalCompaction,
		compactionDiagnostics: advanced?.compactionDiagnostics,
	} satisfies OpenAICodexResponsesOptions;
	const clampedReasoning = options?.reasoning ? clampThinkingLevel(model, options.reasoning) : undefined;
	const reasoningEffort = advanced?.reasoningEffort ?? (clampedReasoning === "off" ? undefined : clampedReasoning);

	return stream(model, context, {
		...base,
		reasoningEffort,
	});
};

export async function prewarmOpenAICodexWebSocket<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	rawOptions: OpenAICodexResponsesOptions,
): Promise<CodexPrewarmResult | undefined> {
	const options = normalizeSessionOptions(rawOptions);
	if (!options?.apiKey || !options.sessionId) return;
	if (getEffectiveCodexTransport(options.transport, options.forceCachedWebSockets, options.sessionId) === "sse") {
		return;
	}

	const responsesLite =
		options.responsesLite ??
		((options.executionMode === "code" || options.executionMode === "notebook") && supportsResponsesLiteModel(model));
	const grammarToolInputProperties = createGrammarToolInputProperties(context.tools, responsesLite);
	const effectiveOptions = {
		...options,
		grammarToolInputProperties,
		...(options.responsesCompaction ? { headers: withRemoteCompactionV2Feature(options.headers) } : {}),
	};
	const body = await prepareCodexRequestBody(model, context, effectiveOptions, responsesLite);
	const accountId = extractAccountId(options.apiKey);
	const routing = resolveCodexRequestRouting({
		model: body.model,
		fast: options.fast === true,
		serviceTier: body.service_tier,
		normalOriginator: options.harnessIdentifierHeader ? PI_CODEX_CONVERSION_ORIGINATOR : "pi",
	});
	const headers = buildWebSocketHeaders(
		model.headers,
		effectiveOptions.headers,
		accountId,
		options.apiKey,
		options.sessionId,
		routing.originator,
		routing.routingHint,
	);
	const websocketBody = withCodexTurnState(
		responsesLite ? applyResponsesLiteWebSocketMetadata(body) : body,
		options.turnState,
	);
	try {
		return await prewarmWebSocket(
			resolveCodexWebSocketUrl(model.baseUrl),
			websocketBody,
			headers,
			accountId,
			effectiveOptions,
			options.turnState,
			noThrowCodexDiagnosticsSink(options.diagnostics),
		);
	} catch (error) {
		if (
			!options.signal?.aborted &&
			(isWebSocketUpgradeRequiredError(error) || isWebSocketMessageTooBigError(error))
		) {
			recordWebSocketSseFallback(options.sessionId);
			return;
		}
		throw error;
	}
}

registerSessionResourceCleanup(closeOpenAICodexWebSocketSessions);

export {
	buildRequestBody,
	closeOpenAICodexWebSocketSessions,
	getOpenAICodexWebSocketDebugStats,
	resetOpenAICodexWebSocketDebugStats,
};
export type { OpenAICodexWebSocketDebugStats, ResponsesBody };
