import type {
	Api,
	AssistantMessageEventStream,
	Context,
	Model,
	Provider,
	SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import { isProductModel } from "./models.ts";

export { PRODUCT_PROVIDER_ID } from "./models.ts";

export function createProductProviders(): Provider[] {
	return [openaiCodexProvider()];
}

export function streamProductModel(
	model: Model<Api>,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream {
	const provider = openaiCodexProvider();
	if (!isProductModel(model) || model.api !== "openai-codex-responses") {
		throw new Error(`Pi-Codex cannot stream ${model.provider}/${model.api}`);
	}
	return provider.streamSimple(model as Model<"openai-codex-responses">, context, options);
}

export function completeProductModel(model: Model<Api>, context: Context, options?: SimpleStreamOptions) {
	return streamProductModel(model, context, options).result();
}
