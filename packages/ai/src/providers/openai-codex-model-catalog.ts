import type { Model } from "../types.ts";

const UNKNOWN_SUBSCRIPTION_COST = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
};

const DAYBREAK_MODELS: Model<"openai-codex-responses">[] = [
	{
		id: "gpt-daybreak-blue-latest",
		name: "Daybreak Blue",
		api: "openai-codex-responses",
		provider: "openai-codex",
		baseUrl: "https://chatgpt.com/backend-api",
		reasoning: true,
		input: ["text", "image"],
		cost: UNKNOWN_SUBSCRIPTION_COST,
		contextWindow: 272_000,
		maxTokens: 128_000,
		thinkingLevelMap: { minimal: "low", xhigh: "xhigh", max: "max" },
		compat: { supportsOpenAIGrammarTools: true, supportsAdditionalTools: true, supportsToolSearch: true },
	},
	{
		id: "gpt-daybreak-red-latest",
		name: "Daybreak Red",
		api: "openai-codex-responses",
		provider: "openai-codex",
		baseUrl: "https://chatgpt.com/backend-api",
		reasoning: true,
		input: ["text", "image"],
		cost: UNKNOWN_SUBSCRIPTION_COST,
		contextWindow: 372_000,
		maxTokens: 128_000,
		thinkingLevelMap: { minimal: "low", xhigh: "xhigh", max: "max" },
		compat: { supportsOpenAIGrammarTools: true, supportsAdditionalTools: true, supportsToolSearch: true },
	},
];

export function withOpenAICodexDaybreakModels(
	models: Model<"openai-codex-responses">[],
): Model<"openai-codex-responses">[] {
	const existing = new Set(models.map(({ id }) => id));
	return [...models, ...DAYBREAK_MODELS.filter(({ id }) => !existing.has(id))];
}
