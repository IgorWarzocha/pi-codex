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
import { registerBranchSummaryRuntime } from "../src/core/compaction/branch-summary-runtime.ts";
import { generateBranchSummary } from "../src/core/compaction/index.ts";
import { convertToLlm, createBranchSummaryMessage } from "../src/core/messages.ts";
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
	it("disables tools for branch summaries", async () => {
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
			model,
			signal: new AbortController().signal,
			streamFn,
		});

		expect(requestOptions).toMatchObject({
			cacheRetention: "short",
			sessionId: "pi-branch-summary",
			toolChoice: "none",
		});
	});

	it("appends a developer shadow turn to the exact active provider context", async () => {
		let requestContext: Context | undefined;
		let requestOptions: SimpleStreamOptions | undefined;
		const streamFn: StreamFn = (_model, context, options) => {
			requestContext = context;
			requestOptions = options;
			const stream = createAssistantMessageEventStream();
			queueMicrotask(() =>
				stream.push({ type: "done", reason: "stop", message: response([{ type: "text", text: "summary" }]) }),
			);
			return stream;
		};
		const toolOutput = "complete tool output ".repeat(300);
		const toolEntries: SessionEntry[] = [
			{
				type: "message",
				id: "branch-assistant",
				parentId: null,
				timestamp: new Date(1).toISOString(),
				message: response([
					{ type: "toolCall", id: "tool-call-1", name: "read", arguments: { path: "README.md" } },
				]),
			},
			{
				type: "message",
				id: "branch-tool-result",
				parentId: "branch-assistant",
				timestamp: new Date(2).toISOString(),
				message: {
					role: "toolResult",
					toolCallId: "tool-call-1",
					toolName: "read",
					content: [{ type: "text", text: toolOutput }],
					isError: false,
					timestamp: 2,
				},
			},
		];
		const sourceContext: Context = {
			systemPrompt: "stable session prompt",
			messages: [
				{ role: "user", content: "retained context", timestamp: 0 },
				response([{ type: "toolCall", id: "tool-call-1", name: "read", arguments: { path: "README.md" } }]),
				{
					role: "toolResult",
					toolCallId: "tool-call-1",
					toolName: "read",
					content: [{ type: "text", text: toolOutput }],
					isError: false,
					timestamp: 2,
				},
			],
			tools: [{ name: "read", description: "Read a file", parameters: { type: "object" } }],
		};
		const onPayload = (payload: unknown): unknown => payload;

		const controller = new AbortController();
		const unregister = registerBranchSummaryRuntime(controller.signal, {
			model,
			streamFn,
			sourceContext,
			requestOptions: {
				sessionId: "session-id",
				transport: "websocket-cached",
				reasoning: "high",
				onPayload,
			},
		});
		try {
			await generateBranchSummary(toolEntries, {
				model,
				signal: controller.signal,
				streamFn: () => {
					throw new Error("ambient tree runtime was not used");
				},
			});
		} finally {
			unregister();
		}

		expect(requestContext?.systemPrompt).toBe(sourceContext.systemPrompt);
		expect(requestContext?.tools).toEqual(sourceContext.tools);
		expect(requestContext?.messages.map((message) => message.role)).toEqual([
			"user",
			"assistant",
			"toolResult",
			"developer",
		]);
		expect(requestContext?.messages[2]).toMatchObject({
			role: "toolResult",
			content: [{ type: "text", text: toolOutput }],
		});
		expect(requestOptions).toMatchObject({
			cacheRetention: "short",
			sessionId: "session-id",
			transport: "websocket-cached",
			reasoning: "high",
			toolChoice: "auto",
			onPayload,
		});
	});

	it("injects persisted branch summaries as developer context", () => {
		const [message] = convertToLlm([
			createBranchSummaryMessage("Completed the branch", "target", new Date(1).toISOString()),
		]);

		expect(message).toMatchObject({ role: "developer" });
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
			model,
			signal: new AbortController().signal,
			streamFn,
		});

		expect(result.error).toBe("Branch summarization attempted to call a tool");
	});
});
