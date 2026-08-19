import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
	exports: Record<string, unknown>;
	dependencies: Record<string, string>;
};

describe("Pi-Codex AI package", () => {
	it("publishes only the core and Codex provider entrypoints", () => {
		expect(Object.keys(packageJson.exports)).toEqual([".", "./providers/openai-codex"]);
	});

	it("does not install stock provider SDKs", () => {
		expect(Object.keys(packageJson.dependencies)).not.toEqual(
			expect.arrayContaining([
				"@anthropic-ai/sdk",
				"@aws-sdk/client-bedrock-runtime",
				"@google/genai",
				"@smithy/node-http-handler",
			]),
		);
	});
});
