import assert from "node:assert/strict";
import type { Agent, AgentContext } from "@earendil-works/pi-agent-core";
import type { Api, Context, Model } from "@earendil-works/pi-ai";
import type {
	OpenAICodexStreamOptions,
	prewarmOpenAICodexWebSocket,
} from "@earendil-works/pi-ai/providers/openai-codex";
import { test } from "vitest";
import { CodexSessionRuntime } from "../src/core/codex-session-runtime.ts";
import type { ModelRuntime } from "../src/core/model-runtime.ts";
import { SessionManager } from "../src/core/session-manager.ts";
import type { SettingsManager } from "../src/core/settings-manager.ts";

test("native Codex prewarm uses the final agent prompt, ordered tools, and session options", async () => {
	const model = {
		provider: "openai-codex",
		id: "gpt-5.4",
		api: "openai-codex-responses",
		baseUrl: "https://chatgpt.com/backend-api",
		reasoning: true,
		input: ["text"],
		contextWindow: 272_000,
		maxTokens: 128_000,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	} as Model<Api>;
	const tools = [
		{ name: "exec", description: "Execute code", parameters: { type: "object" } },
		{ name: "wait", description: "Wait for code", parameters: { type: "object" } },
	];
	let providerContextInput: AgentContext | undefined;
	const agent = {
		state: {
			model,
			systemPrompt: "final native system prompt",
			messages: [{ role: "user", content: "existing turn", timestamp: 1 }],
			tools,
			thinkingLevel: "high",
		},
		buildProviderContext: async (context: AgentContext): Promise<Context> => {
			providerContextInput = context;
			return { systemPrompt: context.systemPrompt, messages: [], tools: context.tools };
		},
	} as unknown as Agent;
	const modelRuntime = {
		getAuth: async () => ({
			auth: {
				apiKey: "codex-token",
				baseUrl: "https://chatgpt.com/backend-api",
				headers: { "x-test": "native" },
			},
			env: { TEST_ENV: "1" },
		}),
	} as unknown as ModelRuntime;
	const settingsManager = {
		getPiCodexSettings: () => ({
			openai: {
				forceCachedWebSockets: true,
				fast: true,
				verbosity: "medium",
				cacheDiagnostics: "off",
			},
			compaction: { responsesCompaction: true },
		}),
		getExecutionMode: () => "code",
		getNotebookSettings: () => ({ maxHeapMiB: 4_096 }),
	} as unknown as SettingsManager;
	const sessionManager = SessionManager.inMemory();
	let prewarmCall: { model: Model<Api>; context: Context; options: OpenAICodexStreamOptions } | undefined;
	const prewarm: typeof prewarmOpenAICodexWebSocket = async (currentModel, context, options) => {
		prewarmCall = { model: currentModel, context, options };
		return { socketReused: true };
	};
	const runtime = new CodexSessionRuntime({
		agent,
		modelRuntime,
		settingsManager,
		sessionManager,
		cwd: "/work/project",
		agentDir: "/tmp/pi-codex-test",
		getExecutionMode: () => "code",
		getUi: () => undefined,
		isIdle: () => true,
		prewarm,
	});

	await runtime.prepareTurn();

	assert.ok(providerContextInput);
	assert.equal(providerContextInput.systemPrompt, "final native system prompt");
	assert.deepEqual(providerContextInput.messages, []);
	assert.ok(providerContextInput.tools);
	assert.deepEqual(
		providerContextInput.tools.map((tool) => tool.name),
		["exec", "wait"],
	);
	assert.ok(prewarmCall);
	assert.equal(prewarmCall.options.sessionId, sessionManager.getSessionId());
	assert.equal(prewarmCall.options.executionMode, "code");
	assert.equal(prewarmCall.options.forceCachedWebSockets, true);
	assert.equal(prewarmCall.options.fast, true);
	assert.equal(prewarmCall.options.responsesCompaction, true);
	assert.equal(prewarmCall.options.textVerbosity, "medium");
	assert.equal(prewarmCall.options.reasoningEffort, "high");
	assert.deepEqual(prewarmCall.options.headers, { "x-test": "native" });
	await runtime.shutdown();
});
