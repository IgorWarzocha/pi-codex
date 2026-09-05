import type { AssistantMessage, Context, ToolResultMessage } from "@earendil-works/pi-ai";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { buildSummaryRequestContext, describeSummaryScope } from "../src/core/compaction/index.ts";

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

function toolCall(id: string): AssistantMessage {
	return fauxAssistantMessage(
		{ type: "toolCall", id, name: "read", arguments: {} },
		{ stopReason: "toolUse", timestamp: 2 },
	);
}

describe("summary request context", () => {
	it("distinguishes identical replies by identity and rejects ambiguous copies", () => {
		const first = toolCall("call");
		const second = structuredClone(first);
		const context = { messages: [first, second] };
		expect(describeSummaryScope(context, [second])).toContain("messages 2 through 2");
		expect(() => describeSummaryScope(context, [structuredClone(first)])).toThrow("ambiguous");
		const rewritten = { ...first, content: [{ type: "text" as const, text: "Rewritten by an extension" }] };
		expect(describeSummaryScope({ messages: [rewritten] }, [first])).toContain("messages 1 through 1");
		expect(() => describeSummaryScope(context, [{ role: "user", content: "absent", timestamp: 3 }])).toThrow(
			"not present",
		);
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
