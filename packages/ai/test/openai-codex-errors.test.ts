import { describe, expect, it } from "vitest";
import { createErrorMessage } from "../src/api/openai-codex/errors.ts";
import { mapCodexEvents } from "../src/api/openai-codex/stream-events.ts";
import { createInitialAssistantMessage, type StreamEventShape } from "../src/api/openai-codex/types.ts";
import type { Model } from "../src/types.ts";

const model: Model<"openai-codex-responses"> = {
	id: "gpt-5.4",
	name: "GPT-5.4",
	api: "openai-codex-responses",
	provider: "openai-codex",
	baseUrl: "https://chatgpt.com/backend-api",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 272_000,
	maxTokens: 128_000,
};

async function providerFailure(event: StreamEventShape) {
	async function* events() {
		yield event;
	}

	let failure: unknown;
	try {
		for await (const _event of mapCodexEvents(events())) {
			// A failure event never yields.
		}
	} catch (error) {
		failure = error;
	}
	if (!failure) throw new Error("Expected Codex failure event to throw");
	return createErrorMessage(createInitialAssistantMessage(model), failure, false);
}

describe("Codex provider errors", () => {
	it.each([
		{
			name: "response.failed",
			event: {
				type: "response.failed",
				response: {
					status: "failed",
					error: { type: "context_length_exceeded", status_code: 400, message: "Opaque failure" },
				},
			} as StreamEventShape,
		},
		{
			name: "error",
			event: {
				type: "error",
				code: "context_length_exceeded",
				status_code: 400,
				message: "Opaque failure",
			} as StreamEventShape,
		},
	])("preserves code and status from $name events", async ({ event }) => {
		const message = await providerFailure(event);
		expect(message).toMatchObject({
			stopReason: "error",
			errorCode: "context_length_exceeded",
			errorStatus: 400,
		});
		expect(message.errorMessage).toContain("Opaque failure");
	});
});
