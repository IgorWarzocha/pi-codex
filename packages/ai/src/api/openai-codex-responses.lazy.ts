import type { ProviderStreams } from "../types.ts";
import { lazyApi } from "./lazy.ts";

const loadOpenAICodexResponses = () => import("./openai-codex-responses.ts");

export const openAICodexResponsesApi = (): ProviderStreams => lazyApi(loadOpenAICodexResponses);
