import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AuthStorage } from "../src/core/auth-storage.ts";
import { ModelRuntime } from "../src/core/model-runtime.ts";
import { productExtensions } from "../src/product/extensions.ts";
import { PRODUCT_MODEL_IDS } from "../src/product/models.ts";

describe("Pi-Codex product composition", () => {
	it("registers only the Codex provider by default", async () => {
		const runtime = await ModelRuntime.create({
			credentials: AuthStorage.inMemory(),
			modelsPath: null,
			allowModelNetwork: false,
		});

		expect(runtime.getProviders().map((provider) => provider.id)).toEqual(["openai-codex"]);
		expect(
			runtime
				.getModels()
				.map((model) => model.id)
				.sort(),
		).toEqual([...PRODUCT_MODEL_IDS].sort());
	});

	it("bundles only the native Pi-Codex extension", () => {
		expect(productExtensions.map((extension) => extension.name)).toEqual(["Pi-Codex"]);
	});

	it("does not reintroduce the stock multi-provider model scope selector", () => {
		expect(
			existsSync(join(import.meta.dirname, "../src/modes/interactive/components/scoped-models-selector.ts")),
		).toBe(false);
	});

	it("rejects configured providers without an explicit stream", async () => {
		const runtime = await ModelRuntime.create({
			credentials: AuthStorage.inMemory(),
			modelsPath: null,
			allowModelNetwork: false,
		});

		expect(() =>
			runtime.registerProvider("custom", {
				baseUrl: "https://example.test/v1",
				apiKey: "test-key",
				api: "openai-completions",
				models: [
					{
						id: "custom",
						name: "Custom",
						reasoning: false,
						input: ["text"],
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
						contextWindow: 128_000,
						maxTokens: 16_384,
					},
				],
			}),
		).toThrow('Provider custom cannot stream api "openai-completions"');
	});
});
