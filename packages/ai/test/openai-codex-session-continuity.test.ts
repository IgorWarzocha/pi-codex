import { afterEach, describe, expect, it } from "vitest";
import {
	clearCanonicalSessions,
	recordCanonicalSessionResponse,
	resolveCanonicalCompactionPromptInput,
} from "../src/api/openai-codex/session-continuity.ts";
import type { ResponsesBody } from "../src/api/openai-codex/types.ts";

const sessionId = "codex-continuity-test";
const identity = { url: "wss://chatgpt.com/backend-api/codex/responses", accountId: "account-1" };

function body(instructions: string, toolNames: string[]): ResponsesBody {
	return {
		model: "gpt-5.4",
		store: false,
		stream: true,
		instructions,
		input: [{ role: "user", content: "hello" }],
		text: { verbosity: "low" },
		include: ["reasoning.encrypted_content"],
		tool_choice: "auto",
		parallel_tool_calls: true,
		tools: toolNames.map((name) => ({ type: "function", name, parameters: { type: "object" } })),
	};
}

describe("Codex canonical compaction identity", () => {
	afterEach(() => clearCanonicalSessions(sessionId));

	it("requires the final instructions and ordered tools to match", () => {
		const recorded = body("final prompt", ["exec", "wait"]);
		recordCanonicalSessionResponse({
			sessionId,
			...identity,
			requestBody: recorded,
			responseItems: [{ type: "message", role: "assistant", content: [] }],
		});
		const reconstructed = [...recorded.input, { type: "message", role: "assistant", content: [] }];

		expect(
			resolveCanonicalCompactionPromptInput(
				sessionId,
				recorded.model,
				identity,
				reconstructed,
				body("final prompt", ["exec", "wait"]),
			).decision,
		).toBe("validated");
		expect(
			resolveCanonicalCompactionPromptInput(
				sessionId,
				recorded.model,
				identity,
				reconstructed,
				body("changed prompt", ["exec", "wait"]),
			).decision,
		).toBe("request_identity_mismatch");
		expect(
			resolveCanonicalCompactionPromptInput(
				sessionId,
				recorded.model,
				identity,
				reconstructed,
				body("final prompt", ["wait", "exec"]),
			).decision,
		).toBe("request_identity_mismatch");
	});
});
