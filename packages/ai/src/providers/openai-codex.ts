import { openAICodexResponsesApi } from "../api/openai-codex-responses.lazy.ts";
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
		api: openAICodexResponsesApi(),
	});
}
