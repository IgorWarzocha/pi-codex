import type { Api, Model, Provider } from "@earendil-works/pi-ai";

export const PRODUCT_PROVIDER_ID = "openai-codex";
export const PRODUCT_MODEL_IDS = ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"] as const;
export const PRODUCT_DEFAULT_MODEL_ID = PRODUCT_MODEL_IDS[0];

export type ProductModelId = (typeof PRODUCT_MODEL_IDS)[number];

export function isProductModelId(value: string): value is ProductModelId {
	return PRODUCT_MODEL_IDS.some((modelId) => modelId === value);
}

export function isProductModel(model: Model<Api>): boolean {
	return model.provider === PRODUCT_PROVIDER_ID && isProductModelId(model.id);
}

/** Apply the fork's model policy after remote catalogs and user overlays are composed. */
export function constrainProductProvider(provider: Provider): Provider {
	if (provider.id !== PRODUCT_PROVIDER_ID) return provider;
	return {
		...provider,
		getModels: () => provider.getModels().filter(isProductModel),
		filterModels: (models, credential) =>
			(provider.filterModels?.(models, credential) ?? models).filter(isProductModel),
	};
}
