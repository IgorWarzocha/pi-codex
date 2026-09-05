import type { StreamFn } from "@earendil-works/pi-agent-core";
import {
	type AssistantMessage,
	type Context,
	createAssistantMessageEventStream,
	fauxAssistantMessage,
	type Model,
	type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { generateBranchSummary } from "../src/core/compaction/index.ts";
import { convertToLlm } from "../src/core/messages.ts";
import type { SessionEntry } from "../src/core/session-manager.ts";

const model: Model<"anthropic-messages"> = {
	id: "test-model",
	name: "Test Model",
	api: "anthropic-messages",
	provider: "anthropic",
	baseUrl: "https://api.anthropic.com",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 200000,
	maxTokens: 8192,
};

const entries: SessionEntry[] = [
	{
		type: "message",
		id: "branch-user",
		parentId: null,
		timestamp: new Date(1).toISOString(),
		message: { role: "user", content: "Abandoned request", timestamp: 1 },
	},
];

function response(content: AssistantMessage["content"]): AssistantMessage {
	return {
		...fauxAssistantMessage(""),
		content,
		api: model.api,
		provider: model.provider,
		model: model.id,
	};
}

describe("branch summarization", () => {
	it("keeps trailing tool results in the selected branch without changing tool choice", async () => {
		const branchEntries: SessionEntry[] = [
			...entries,
			{
				type: "message",
				id: "tool-call",
				parentId: "branch-user",
				timestamp: new Date(2).toISOString(),
				message: {
					...response([{ type: "toolCall", id: "call", name: "read", arguments: {} }]),
					stopReason: "toolUse",
				},
			},
			{
				type: "message",
				id: "tool-result",
				parentId: "tool-call",
				timestamp: new Date(2).toISOString(),
				message: {
					role: "toolResult",
					toolCallId: "call",
					toolName: "read",
					content: [{ type: "text", text: "result" }],
					isError: false,
					timestamp: 2,
				},
			},
		];
		const context: Context = {
			messages: [
				{ role: "user", content: "Common ancestor", timestamp: 0 },
				...convertToLlm(branchEntries.flatMap((entry) => (entry.type === "message" ? [entry.message] : []))),
			],
		};
		let requestContext: Context | undefined;
		let requestOptions: SimpleStreamOptions | undefined;
		const streamFn: StreamFn = (_model, _context, options) => {
			requestContext = _context;
			requestOptions = options;
			const stream = createAssistantMessageEventStream();
			queueMicrotask(() =>
				stream.push({ type: "done", reason: "stop", message: response([{ type: "text", text: "summary" }]) }),
			);
			return stream;
		};

		await generateBranchSummary(branchEntries, {
			requestConfig: { context },
			model: { ...model, reasoning: true },
			thinkingLevel: "low",
			signal: new AbortController().signal,
			streamFn,
		});

		expect(requestOptions?.maxTokens).toBe(4096);
		expect(requestOptions?.toolChoice).toBeUndefined();
		expect(requestOptions?.reasoning).toBe("low");
		expect(JSON.stringify(requestContext?.messages.at(-1))).toContain("messages 2 through 4");
		expect(requestContext?.messages.slice(0, -1)).toEqual(context.messages);
	});

	it.each([
		{ name: "model limit", maxTokens: 1024, reserveTokens: 16384 },
		{ name: "reserved headroom", maxTokens: 8192, reserveTokens: 1024 },
	])("clamps the branch summary output cap to the $name", async ({ maxTokens, reserveTokens }) => {
		let requestOptions: SimpleStreamOptions | undefined;
		const streamFn: StreamFn = (_model, _context, options) => {
			requestOptions = options;
			const stream = createAssistantMessageEventStream();
			queueMicrotask(() =>
				stream.push({ type: "done", reason: "stop", message: response([{ type: "text", text: "summary" }]) }),
			);
			return stream;
		};

		await generateBranchSummary(entries, {
			requestConfig: { context: { messages: [{ role: "user", content: "Abandoned request", timestamp: 1 }] } },
			model: { ...model, maxTokens },
			reserveTokens,
			signal: new AbortController().signal,
			streamFn,
		});

		expect(requestOptions?.maxTokens).toBe(1024);
	});

	it("rejects tool calls from branch summaries", async () => {
		const streamFn: StreamFn = () => {
			const stream = createAssistantMessageEventStream();
			queueMicrotask(() =>
				stream.push({
					type: "done",
					reason: "toolUse",
					message: response([
						{ type: "toolCall", id: "tool-call-1", name: "read", arguments: { path: "README.md" } },
					]),
				}),
			);
			return stream;
		};

		const result = await generateBranchSummary(entries, {
			requestConfig: { context: { messages: [{ role: "user", content: "Abandoned request", timestamp: 1 }] } },
			model,
			signal: new AbortController().signal,
			streamFn,
		});

		expect(result.error).toBe("Branch summarization attempted to call a tool");
	});

	it("rejects length-limited branch summaries", async () => {
		const streamFn: StreamFn = () => {
			const stream = createAssistantMessageEventStream();
			queueMicrotask(() =>
				stream.push({
					type: "done",
					reason: "length",
					message: { ...response([{ type: "text", text: "partial" }]), stopReason: "length" },
				}),
			);
			return stream;
		};

		const result = await generateBranchSummary(entries, {
			requestConfig: { context: { messages: [{ role: "user", content: "Abandoned request", timestamp: 1 }] } },
			model,
			signal: new AbortController().signal,
			streamFn,
		});

		expect(result.error).toBe(
			"Branch summarization failed: generation hit the token cap and the summary is incomplete",
		);
	});
});
