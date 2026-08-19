import type {
	Api,
	AssistantMessageEventStream,
	Context,
	Model,
	Provider,
	SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";

export const PRODUCT_PROVIDER_ID = "openai-codex";

export function createProductProviders(): Provider[] {
	return [openaiCodexProvider()];
}

export function streamProductModel(
	model: Model<Api>,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream {
	const provider = openaiCodexProvider();
	if (model.provider !== provider.id || model.api !== "openai-codex-responses") {
		throw new Error(`Pi-Codex cannot stream ${model.provider}/${model.api}`);
	}
	return provider.streamSimple(model as Model<"openai-codex-responses">, context, options);
}

export function completeProductModel(model: Model<Api>, context: Context, options?: SimpleStreamOptions) {
	return streamProductModel(model, context, options).result();
}
