import type { ProviderStreams } from "../types.ts";
import { lazyApi } from "./lazy.ts";

const loadOpenAICodexResponses = () => import("./openai-codex-responses.ts");
const prewarmRegistryKey = Symbol.for("@earendil-works/pi-ai/openai-codex-prewarm");
(globalThis as typeof globalThis & { [key: symbol]: unknown })[prewarmRegistryKey] = {
	load: async () => {
		const implementation = await loadOpenAICodexResponses();
		return implementation.prewarmOpenAICodexWebSocket;
	},
};

export const openAICodexResponsesApi = (): ProviderStreams => lazyApi(loadOpenAICodexResponses);
