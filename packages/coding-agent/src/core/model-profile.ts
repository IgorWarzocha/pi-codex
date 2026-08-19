import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";

export interface ModelProfile {
	model: Model<Api>;
	contextWindow: number;
	thinkingLevel: ThinkingLevel;
}

export function withProfileContextWindow(model: Model<Api>, contextWindow: number): Model<Api> {
	return model.contextWindow === contextWindow ? model : { ...model, contextWindow };
}
