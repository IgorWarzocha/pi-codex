import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import { type ModelProfile, withProfileContextWindow } from "../core/model-profile.ts";
import { PRODUCT_MODEL_IDS } from "./models.ts";

export const CODEX_PROFILE_MODEL_IDS = PRODUCT_MODEL_IDS;
export const CODEX_PROFILE_CONTEXT_WINDOWS = [272_000, 472_000, 872_000] as const;
export const CODEX_PROFILE_REASONING_LEVELS: ThinkingLevel[] = ["low", "medium", "high", "xhigh", "max"];

export type CodexProfileModelId = (typeof CODEX_PROFILE_MODEL_IDS)[number];
export type CodexProfileContextWindow = (typeof CODEX_PROFILE_CONTEXT_WINDOWS)[number];

export interface SavedModelProfile {
	modelId: CodexProfileModelId;
	contextWindow: CodexProfileContextWindow;
	thinkingLevel: ThinkingLevel;
}

export function isCodexProfileModelId(value: string): value is CodexProfileModelId {
	return CODEX_PROFILE_MODEL_IDS.some((modelId) => modelId === value);
}

export function isCodexProfileContextWindow(value: number): value is CodexProfileContextWindow {
	return CODEX_PROFILE_CONTEXT_WINDOWS.some((contextWindow) => contextWindow === value);
}

export function withCodexProfileCapabilities(model: Model<Api>): Model<Api> {
	return {
		...model,
		thinkingLevelMap: {
			...model.thinkingLevelMap,
			xhigh: model.thinkingLevelMap?.xhigh ?? "xhigh",
			max: model.thinkingLevelMap?.max ?? "max",
		},
	};
}

export function isSavedModelProfile(value: unknown): value is SavedModelProfile {
	if (typeof value !== "object" || value === null) return false;
	const profile = value as Record<string, unknown>;
	return (
		typeof profile.modelId === "string" &&
		isCodexProfileModelId(profile.modelId) &&
		typeof profile.contextWindow === "number" &&
		isCodexProfileContextWindow(profile.contextWindow) &&
		typeof profile.thinkingLevel === "string" &&
		CODEX_PROFILE_REASONING_LEVELS.some((level) => level === profile.thinkingLevel)
	);
}

export function modelProfileKey(
	profile: Pick<SavedModelProfile, "modelId" | "contextWindow" | "thinkingLevel">,
): string {
	return `${profile.modelId}\0${profile.contextWindow}\0${profile.thinkingLevel}`;
}

export function savedModelProfile(profile: ModelProfile): SavedModelProfile {
	if (!isCodexProfileModelId(profile.model.id)) {
		throw new Error(`Unsupported Pi-Codex model profile: ${profile.model.id}`);
	}
	if (!isCodexProfileContextWindow(profile.contextWindow)) {
		throw new Error(`Unsupported Pi-Codex context window: ${profile.contextWindow}`);
	}
	return {
		modelId: profile.model.id,
		contextWindow: profile.contextWindow,
		thinkingLevel: profile.thinkingLevel,
	};
}

export function resolveSavedModelProfiles(
	profiles: readonly SavedModelProfile[],
	models: readonly Model<Api>[],
): ModelProfile[] {
	const modelsById = new Map(models.map((model) => [model.id, model]));
	return profiles.flatMap((profile) => {
		const model = modelsById.get(profile.modelId);
		return model
			? [
					{
						model: withProfileContextWindow(withCodexProfileCapabilities(model), profile.contextWindow),
						contextWindow: profile.contextWindow,
						thinkingLevel: profile.thinkingLevel,
					},
				]
			: [];
	});
}
