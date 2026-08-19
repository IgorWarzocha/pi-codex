import { withRemoteCompactionV2Feature } from "../api/openai-codex/compaction-v2-feature.ts";
import { codexDiagnosticsFailure } from "../api/openai-codex/diagnostic-failure.ts";
import { extractAccountId, resolveCodexWebSocketUrl } from "../api/openai-codex/headers.ts";
import {
	canonicalCompactionPromptInput,
	canonicalCompactionRequestBody,
	resolveCanonicalCompactionPromptInput,
} from "../api/openai-codex/session-continuity.ts";
import { prewarmOpenAICodexWebSocket, stream, streamSimple } from "../api/openai-codex-responses.ts";
import { lazyOAuth } from "../auth/helpers.ts";
import { loadOpenAICodexOAuth } from "../auth/oauth/load.ts";
import { createProvider, type Provider } from "../models.ts";
import { OPENAI_CODEX_MODELS } from "./openai-codex.models.ts";
import { withOpenAICodexDaybreakModels } from "./openai-codex-model-catalog.ts";

export function openaiCodexProvider(): Provider<"openai-codex-responses"> {
	return createProvider({
		id: "openai-codex",
		name: "OpenAI Codex",
		baseUrl: "https://chatgpt.com/backend-api",
		auth: {
			oauth: lazyOAuth({
				name: "ChatGPT Plus/Pro (Codex Subscription)",
				isSubscription: true,
				load: loadOpenAICodexOAuth,
			}),
		},
		models: withOpenAICodexDaybreakModels(Object.values(OPENAI_CODEX_MODELS)),
		api: { stream, streamSimple },
	});
}

export {
	canonicalCompactionPromptInput,
	canonicalCompactionRequestBody,
	codexDiagnosticsFailure,
	extractAccountId,
	prewarmOpenAICodexWebSocket,
	resolveCanonicalCompactionPromptInput,
	resolveCodexWebSocketUrl,
	withRemoteCompactionV2Feature,
};
export type {
	CodexDiagnosticsEvent,
	CodexDiagnosticsFailure,
	CodexDiagnosticsFailureCategory,
	CodexDiagnosticsLane,
	CodexDiagnosticsSink,
	CodexDiagnosticsTransport,
	CodexPrewarmOptions,
	CodexPrewarmResult,
	OpenAICodexStreamOptions,
	ResponsesBody,
} from "../api/openai-codex/types.ts";
