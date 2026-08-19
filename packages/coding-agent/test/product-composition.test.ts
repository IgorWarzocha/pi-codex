import { describe, expect, it } from "vitest";
import { AuthStorage } from "../src/core/auth-storage.ts";
import { ModelRuntime } from "../src/core/model-runtime.ts";
import { productExtensions } from "../src/product/extensions.ts";

describe("Pi-Codex product composition", () => {
	it("registers only the Codex provider by default", async () => {
		const runtime = await ModelRuntime.create({
			credentials: AuthStorage.inMemory(),
			modelsPath: null,
			allowModelNetwork: false,
		});

		expect(runtime.getProviders().map((provider) => provider.id)).toEqual(["openai-codex"]);
	});

	it("bundles only the native Pi-Codex extension", () => {
		expect(productExtensions.map((extension) => extension.name)).toEqual(["Pi-Codex"]);
	});
});
