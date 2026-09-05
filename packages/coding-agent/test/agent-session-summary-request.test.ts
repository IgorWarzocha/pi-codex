import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent } from "@earendil-works/pi-agent-core";
import {
	type AssistantMessage,
	type Context,
	createAssistantMessageEventStream,
	type Model,
	type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentSession } from "../src/core/agent-session.ts";
import { AuthStorage } from "../src/core/auth-storage.ts";
import { SessionManager } from "../src/core/session-manager.ts";
import { SettingsManager } from "../src/core/settings-manager.ts";
import { createModelRegistry, getModelRuntime } from "./model-runtime-test-utils.ts";
import { createTestResourceLoader } from "./utilities.ts";

const model: Model<"openai-responses"> = {
	id: "summary-context-model",
	name: "Summary Context Model",
	api: "openai-responses",
	provider: "test-provider",
	baseUrl: "https://example.invalid",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 200000,
	maxTokens: 8192,
};

function response(text: string): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: model.api,
		provider: model.provider,
		model: model.id,
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
	};
}

describe("AgentSession summary requests", () => {
	let tempDir: string;
	let session: AgentSession | undefined;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "pi-summary-request-"));
	});

	afterEach(() => {
		session?.dispose();
		session = undefined;
		rmSync(tempDir, { recursive: true, force: true });
	});

	async function createSession(transformContext?: Agent["transformContext"]): Promise<{
		requests: Array<{ context: Context; options: SimpleStreamOptions | undefined }>;
		onPayload: NonNullable<SimpleStreamOptions["onPayload"]>;
		onContextPrepared: ReturnType<typeof vi.fn>;
	}> {
		const requests: Array<{ context: Context; options: SimpleStreamOptions | undefined }> = [];
		const onPayload = vi.fn((payload: unknown) => payload);
		const onContextPrepared = vi.fn();
		const agent = new Agent({
			initialState: { model, systemPrompt: "initial", tools: [] },
			transformContext,
			onPayload,
			onContextPrepared,
			streamFn: (_model, context, options) => {
				requests.push({ context, options });
				const stream = createAssistantMessageEventStream();
				const text = options?.transport === "sse" ? "## Goal\nSummary" : "normal response";
				queueMicrotask(() => stream.push({ type: "done", reason: "stop", message: response(text) }));
				return stream;
			},
		});
		const settingsManager = SettingsManager.inMemory();
		settingsManager.applyOverrides({ compaction: { keepRecentTokens: 1, reserveTokens: 2000 } });
		const sessionManager = SessionManager.inMemory(tempDir);
		const modelRegistry = await createModelRegistry(AuthStorage.create(join(tempDir, "auth.json")));
		session = new AgentSession({
			agent,
			sessionManager,
			settingsManager,
			cwd: tempDir,
			modelRuntime: getModelRuntime(modelRegistry),
			resourceLoader: createTestResourceLoader(),
		});
		return { requests, onPayload, onContextPrepared };
	}

	it("compacts from the final transformed context with normal routing and cache retention", async () => {
		let transformCount = 0;
		const { requests, onPayload, onContextPrepared } = await createSession(async (messages) => {
			transformCount++;
			return [...messages, { role: "user", content: `transformed-${transformCount}`, timestamp: 2 }];
		});

		await session!.agent.prompt("compact me");
		const normalRequest = requests[0];
		await session!.compact();
		const summaryRequest = requests[1];

		expect(transformCount).toBe(1);
		expect(onContextPrepared).toHaveBeenCalledTimes(1);
		expect(summaryRequest.context.systemPrompt).toBe(normalRequest.context.systemPrompt);
		expect(summaryRequest.context.tools).toEqual(normalRequest.context.tools);
		expect(summaryRequest.context.messages.slice(0, normalRequest.context.messages.length)).toEqual(
			normalRequest.context.messages,
		);
		expect(summaryRequest.context.messages).toContainEqual(
			expect.objectContaining({ role: "assistant", content: [{ type: "text", text: "normal response" }] }),
		);
		expect(JSON.stringify(summaryRequest.context.messages.at(-1))).toContain(
			"This is the PREFIX of a turn that was too large to keep",
		);
		expect(summaryRequest.options).toMatchObject({
			sessionId: session!.sessionId,
			transport: "sse",
			onPayload,
		});
		expect(summaryRequest.options?.cacheRetention).toBeUndefined();
	});

	it("constructs tree summaries from the same structured request context", async () => {
		const { requests } = await createSession();
		await session!.agent.prompt("first");
		await session!.agent.prompt("second");

		const entries = session!.sessionManager.getEntries();
		const secondUser = entries.filter((entry) => entry.type === "message" && entry.message.role === "user")[1];
		const normalRequest = requests.at(-1)!;
		const result = await session!.navigateTree(secondUser.id, { summarize: true });
		const summaryRequest = requests.at(-1)!;

		expect(result.summaryEntry?.type).toBe("branch_summary");
		expect(summaryRequest).not.toBe(normalRequest);
		expect(summaryRequest.context.systemPrompt).toBe(normalRequest.context.systemPrompt);
		expect(summaryRequest.context.tools).toEqual(normalRequest.context.tools);
		expect(summaryRequest.context.messages.slice(0, normalRequest.context.messages.length)).toEqual(
			normalRequest.context.messages,
		);
		expect(JSON.stringify(summaryRequest.context.messages.at(-1))).toContain(
			"Create a structured summary of this conversation branch",
		);
		expect(summaryRequest.options).toMatchObject({ sessionId: session!.sessionId, transport: "sse" });
		expect(summaryRequest.options?.cacheRetention).toBeUndefined();
	});
});
