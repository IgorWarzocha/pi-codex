import type { AssistantMessage, Context, ToolResultMessage } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { buildSummaryRequestContext } from "../src/core/compaction/index.ts";

function toolResult(id: string, text: string): ToolResultMessage {
	return {
		role: "toolResult",
		toolCallId: id,
		toolName: "read",
		content: [{ type: "text", text }],
		isError: false,
		timestamp: 1,
	};
}

function toolCall(id: string, path?: string): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "toolCall", id, name: "read", arguments: path ? { path } : {} }],
		api: "openai-responses",
		provider: "openai",
		model: "test",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "toolUse",
		timestamp: 2,
	};
}

describe("summary request context", () => {
	it("preserves structured context and appends instructions", () => {
		const context: Context = {
			systemPrompt: "normal system prompt",
			tools: [{ name: "read", description: "Read a file", parameters: { type: "object" } }],
			messages: [
				{ role: "user", content: "inspect README", timestamp: 1 },
				toolCall("call-1", "README.md"),
				toolResult("call-1", "file contents"),
			],
		};

		const request = buildSummaryRequestContext(context, "Existing summary instructions", 1000, 100);

		expect(request.systemPrompt).toBe(context.systemPrompt);
		expect(request.tools).toEqual(context.tools);
		expect(request.messages.slice(0, -1)).toEqual(context.messages);
		expect(request.messages.at(-1)).toMatchObject({
			role: "user",
			content: [{ type: "text", text: "Existing summary instructions" }],
		});
	});

	it("shortens tool results newest-first without mutating canonical history", () => {
		const oldResult = toolResult("old-call", "o".repeat(400));
		const newestResult = toolResult("new-call", "n".repeat(400));
		const context: Context = {
			systemPrompt: "s",
			messages: [toolCall("old-call"), oldResult, toolCall("new-call"), newestResult],
		};

		const request = buildSummaryRequestContext(context, "sum", 115, 10);
		const requestOldResult = request.messages[1] as ToolResultMessage;
		const requestNewestResult = request.messages[3] as ToolResultMessage;

		expect(requestOldResult.content.at(-1)).toEqual({
			type: "text",
			text: "[Tool result shortened for summary request]",
		});
		expect(requestOldResult.content[0]).toMatchObject({ type: "text", text: expect.stringMatching(/^o+$/) });
		expect(requestNewestResult.toolCallId).toBe("new-call");
		expect(requestNewestResult.content).toEqual([
			{ type: "text", text: "[Tool result shortened for summary request]" },
		]);
		expect(oldResult.content).toEqual([{ type: "text", text: "o".repeat(400) }]);
		expect(newestResult.content).toEqual([{ type: "text", text: "n".repeat(400) }]);
	});

	it("fails when non-tool context cannot fit beside the output reserve", () => {
		const context: Context = {
			systemPrompt: "x".repeat(1000),
			messages: [{ role: "user", content: "request", timestamp: 1 }],
		};

		expect(() => buildSummaryRequestContext(context, "summarize", 100, 10)).toThrow("Summary request is too large");
	});
});
