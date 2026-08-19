import { zstdDecompressSync } from "node:zlib";
import { Type } from "typebox";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	buildSSEHeaders,
	buildWebSocketHeaders,
	CODEX_FAST_MODE_ORIGINATOR,
	resolveCodexRequestRouting,
	X_CODEX_ROUTING_HINT_HEADER,
} from "../src/api/openai-codex/headers.ts";
import {
	applyResponsesLiteRequest,
	prepareResponsesLiteRequestImages,
} from "../src/api/openai-codex/responses-lite.ts";
import { createCodexTurnState } from "../src/api/openai-codex/turn-state.ts";
import { resolveWebSocketProxyForTarget } from "../src/api/openai-codex/websocket-connection.ts";
import type { OpenAICodexResponsesOptions } from "../src/api/openai-codex-responses.ts";
import {
	buildRequestBody,
	closeOpenAICodexWebSocketSessions,
	getOpenAICodexWebSocketDebugStats,
	resetOpenAICodexWebSocketDebugStats,
	stream,
	streamSimple,
} from "../src/api/openai-codex-responses.ts";
import type { Context, Model, SimpleStreamOptions } from "../src/types.ts";

const model: Model<"openai-codex-responses"> = {
	id: "gpt-5.6-luna",
	name: "GPT-5.6 Luna",
	api: "openai-codex-responses",
	provider: "openai-codex",
	baseUrl: "https://chatgpt.com/backend-api",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 400_000,
	maxTokens: 128_000,
	compat: { supportsStrictMode: true, supportsAdditionalTools: true },
};

const userContext = (text = "Hello"): Context => ({
	systemPrompt: "Instructions",
	messages: [{ role: "user", content: text, timestamp: 1 }],
});

function token(accountId = "acct_1"): string {
	const payload = Buffer.from(
		JSON.stringify({
			"https://api.openai.com/auth": { chatgpt_account_id: accountId },
		}),
	).toString("base64");
	return `aaa.${payload}.bbb`;
}

function decodeBody(body: RequestInit["body"]): Record<string, unknown> {
	if (typeof body === "string") return JSON.parse(body) as Record<string, unknown>;
	if (body instanceof Uint8Array) {
		return JSON.parse(Buffer.from(zstdDecompressSync(body)).toString("utf8")) as Record<string, unknown>;
	}
	throw new Error("Unexpected request body");
}

function sseResponse(events: unknown[], headers?: Record<string, string>): Response {
	const payload = `${events.map((event) => `data: ${JSON.stringify(event)}`).join("\n\n")}\n\n`;
	return new Response(payload, {
		status: 200,
		headers: { "content-type": "text/event-stream", ...headers },
	});
}

function completedResponse(id: string, text?: string): unknown[] {
	const output =
		text === undefined
			? []
			: [
					{
						type: "response.output_item.done",
						output_index: 0,
						item: {
							type: "message",
							id: `msg_${id}`,
							role: "assistant",
							status: "completed",
							content: [{ type: "output_text", text, annotations: [] }],
						},
					},
				];
	return [
		{ type: "response.created", response: { id } },
		...output,
		{
			type: "response.completed",
			response: {
				id,
				status: "completed",
				usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
			},
		},
	];
}

type Script = (socket: ScriptedWebSocket, body: Record<string, unknown>) => void;

class ScriptedWebSocket extends EventTarget {
	static scripts: Script[] = [];
	static opened = 0;
	static sent: Record<string, unknown>[] = [];
	static OPEN = 1;
	static CLOSED = 3;
	readyState = ScriptedWebSocket.OPEN;

	constructor() {
		super();
		ScriptedWebSocket.opened++;
		queueMicrotask(() => this.dispatchEvent(new Event("open")));
	}

	send(data: string): void {
		const body = JSON.parse(data) as Record<string, unknown>;
		ScriptedWebSocket.sent.push(body);
		const script = ScriptedWebSocket.scripts.shift();
		if (!script) throw new Error("No scripted WebSocket response");
		script(this, body);
	}

	close(): void {
		this.readyState = ScriptedWebSocket.CLOSED;
	}

	emit(type: string, fields: Record<string, unknown>): void {
		this.dispatchEvent(Object.assign(new Event(type), fields));
	}

	emitJson(event: unknown): void {
		queueMicrotask(() => this.emit("message", { data: JSON.stringify(event) }));
	}

	emitEvents(events: unknown[]): void {
		queueMicrotask(() => {
			for (const event of events) this.emit("message", { data: JSON.stringify(event) });
		});
	}
}

afterEach(() => {
	closeOpenAICodexWebSocketSessions();
	resetOpenAICodexWebSocketDebugStats();
	ScriptedWebSocket.scripts = [];
	ScriptedWebSocket.opened = 0;
	ScriptedWebSocket.sent = [];
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("openai-codex provider", () => {
	it("builds the Codex request shape without output token caps", () => {
		const body = buildRequestBody(
			model,
			{
				...userContext(),
				tools: [
					{
						name: "example",
						description: "Example",
						parameters: Type.Object({ value: Type.String() }),
					},
				],
			},
			{
				sessionId: `session-${"x".repeat(80)}`,
				serviceTier: "priority",
				textVerbosity: "medium",
				reasoningEffort: "high",
				reasoningSummary: "detailed",
				maxTokens: 1234,
			},
		);

		expect(body).toMatchObject({
			model: "gpt-5.6-luna",
			store: false,
			stream: true,
			instructions: "Instructions",
			text: { verbosity: "medium" },
			prompt_cache_key: `session-${"x".repeat(56)}`,
			service_tier: "priority",
			reasoning: { effort: "high", summary: "detailed" },
			parallel_tool_calls: true,
		});
		expect(body.tools).toEqual([
			{
				type: "function",
				name: "example",
				description: "Example",
				parameters: {
					type: "object",
					properties: { value: { type: "string" } },
					required: ["value"],
				},
				strict: null,
			},
		]);
		expect(body).not.toHaveProperty("max_output_tokens");
		expect(body).not.toHaveProperty("max_completion_tokens");
	});

	it("preserves session developer messages and records the request path", async () => {
		let requestBody: Record<string, unknown> | undefined;
		const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
			requestBody = decodeBody(init?.body);
			return sseResponse(completedResponse("resp_developer"));
		});
		const result = await stream(
			model,
			{
				systemPrompt: "Instructions",
				messages: [
					{ role: "developer", content: "Application context", timestamp: 1 },
					{ role: "user", content: "User request", timestamp: 2 },
				],
			},
			{ apiKey: token(), transport: "sse", fetch: fetchMock },
		).result();

		expect(requestBody?.input).toEqual([
			{ role: "developer", content: [{ type: "input_text", text: "Application context" }] },
			{ role: "user", content: [{ type: "input_text", text: "User request" }] },
		]);
		expect(result.diagnostics?.at(-1)).toMatchObject({
			type: "openai_codex_cache",
			details: { transport: "sse", fullInputItems: 2, sentInputItems: 2 },
		});
	});

	it("keeps Fast Mode routing identical across transports", () => {
		const routing = resolveCodexRequestRouting({
			model: model.id,
			fast: true,
			serviceTier: "priority",
		});
		expect(routing).toEqual({
			originator: CODEX_FAST_MODE_ORIGINATOR,
			routingHint: "model=gpt-5.6-luna;tier=priority",
		});
		for (const headers of [
			buildSSEHeaders(
				undefined,
				undefined,
				"account",
				"token",
				"session",
				false,
				routing.originator,
				routing.routingHint,
			),
			buildWebSocketHeaders(
				undefined,
				undefined,
				"account",
				"token",
				"session",
				routing.originator,
				routing.routingHint,
			),
		]) {
			expect(headers.get("originator")).toBe(CODEX_FAST_MODE_ORIGINATOR);
			expect(headers.get(X_CODEX_ROUTING_HINT_HEADER)).toBe("model=gpt-5.6-luna;tier=priority");
		}
	});

	it("streams SSE and replays captured turn state on a retry", async () => {
		const turnState = createCodexTurnState();
		const headers: Headers[] = [];
		let calls = 0;
		const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
			headers.push(new Headers(init?.headers));
			calls++;
			if (calls === 1) {
				return new Response(
					"data: {bad}\n\ndata: " +
						JSON.stringify({
							type: "response.output_item.done",
							output_index: 0,
							item: {
								type: "message",
								id: "discarded",
								role: "assistant",
								status: "completed",
								content: [],
							},
						}) +
						"\n\n",
					{
						headers: {
							"content-type": "text/event-stream",
							"x-codex-turn-state": "turn-1",
						},
					},
				);
			}
			return sseResponse(completedResponse("resp_2", "Recovered"));
		});

		const result = await stream(model, userContext(), {
			apiKey: token(),
			transport: "sse",
			maxRetries: 1,
			turnState,
			fetch: fetchMock,
		}).result();

		expect(result.content.find((item) => item.type === "text")?.text).toBe("Recovered");
		expect(headers).toHaveLength(2);
		expect(headers[0]?.get("x-codex-turn-state")).toBeNull();
		expect(headers[1]?.get("x-codex-turn-state")).toBe("turn-1");
	});

	it("encodes Responses Lite as developer input items", async () => {
		let requestHeaders: Headers | undefined;
		let requestBody: Record<string, unknown> | undefined;
		const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
			requestHeaders = new Headers(init?.headers);
			requestBody = decodeBody(init?.body);
			return sseResponse(completedResponse("resp_lite"));
		});
		const options: SimpleStreamOptions & Partial<OpenAICodexResponsesOptions> = {
			apiKey: token(),
			transport: "sse",
			executionMode: "code",
			fetch: fetchMock,
		};

		const result = await streamSimple(
			model,
			{
				...userContext(),
				tools: [
					{
						name: "exec",
						description: "Execute code",
						parameters: Type.Object({ code: Type.String() }),
						constrainedSampling: {
							type: "grammar",
							variants: { openai_lark: "start: /[\\s\\S]+/" },
						},
					},
				],
			},
			options,
		).result();

		expect(result.stopReason).toBe("stop");
		expect(requestHeaders?.get("x-openai-internal-codex-responses-lite")).toBe("true");
		expect(requestBody).not.toHaveProperty("instructions");
		expect(requestBody).not.toHaveProperty("tools");
		expect(requestBody).toMatchObject({
			parallel_tool_calls: false,
			reasoning: { context: "all_turns" },
		});
		const input = requestBody?.input as Array<Record<string, unknown>>;
		expect(input[0]).toMatchObject({ type: "additional_tools", role: "developer" });
		expect(input[1]).toEqual({
			type: "message",
			role: "developer",
			content: [{ type: "input_text", text: "Instructions" }],
		});
		expect(input[2]).toEqual({
			role: "user",
			content: [{ type: "input_text", text: "Hello" }],
		});
	});

	it("resizes and validates Responses Lite inline images inside the provider", async () => {
		const validPng =
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";
		const body = await prepareResponsesLiteRequestImages(
			applyResponsesLiteRequest({
				model: model.id,
				input: [
					{
						type: "message",
						role: "user",
						content: [
							{ type: "input_image", image_url: `data:image/png;base64,${validPng}` },
							{ type: "input_image", image_url: "data:image/png;base64,not-valid" },
						],
					},
				],
			}),
		);
		const content = (body.input[1] as { content: Array<{ type: string; image_url?: string; text?: string }> })
			.content;

		expect(content[0]?.type).toBe("input_image");
		expect(content[0]?.image_url).toMatch(/^data:image\/(?:png|jpeg);base64,/);
		expect(content[1]).toEqual({
			type: "input_text",
			text: "image content omitted because it could not be processed",
		});
	});

	it("resolves WebSocket proxies with the provider's scoped environment", async () => {
		const env = {
			ALL_PROXY: "",
			HTTP_PROXY: "",
			HTTPS_PROXY: "http://proxy.example:8080",
			NO_PROXY: "direct.example",
		};

		await expect(resolveWebSocketProxyForTarget("wss://api.example/codex", env)).resolves.toBe(
			"http://proxy.example:8080",
		);
		await expect(resolveWebSocketProxyForTarget("wss://direct.example/codex", env)).resolves.toBeUndefined();
	});

	it.each([
		[
			"upgrade",
			(socket: ScriptedWebSocket) =>
				queueMicrotask(() =>
					socket.emit("error", { message: "Unexpected server response: 426 Upgrade Required", status: 426 }),
				),
		],
		[
			"message size",
			(socket: ScriptedWebSocket) => queueMicrotask(() => socket.emit("close", { code: 1009, reason: "" })),
		],
	] as const)("falls back immediately on WebSocket %s and keeps SSE sticky", async (_name, fail) => {
		ScriptedWebSocket.scripts = [fail];
		vi.stubGlobal("WebSocket", ScriptedWebSocket);
		const fetchMock = vi.fn(async () => sseResponse(completedResponse("resp_sse")));
		const options = {
			apiKey: token(),
			sessionId: "sticky-session",
			transport: "auto" as const,
			fetch: fetchMock,
		};

		await stream(model, userContext(), options).result();
		await stream(model, userContext("Again"), options).result();

		expect(ScriptedWebSocket.opened).toBe(1);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(getOpenAICodexWebSocketDebugStats("sticky-session")).toMatchObject({
			sseFallbacks: 1,
			websocketFallbackActive: true,
		});
	});

	it("retries a failed WebSocket with a fresh full request", async () => {
		ScriptedWebSocket.scripts = [
			(socket) => queueMicrotask(() => socket.emit("close", { code: 1006, reason: "lost" })),
			(socket) => socket.emitEvents(completedResponse("resp_recovered", "Recovered")),
		];
		vi.stubGlobal("WebSocket", ScriptedWebSocket);
		const fetchMock = vi.fn();

		const result = await stream(model, userContext(), {
			apiKey: token(),
			sessionId: "retry-session",
			transport: "auto",
			maxRetries: 1,
			fetch: fetchMock,
		}).result();

		expect(result.content.find((item) => item.type === "text")?.text).toBe("Recovered");
		expect(ScriptedWebSocket.opened).toBe(2);
		expect(ScriptedWebSocket.sent).toHaveLength(2);
		expect(ScriptedWebSocket.sent[1]).not.toHaveProperty("previous_response_id");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("continues a cached WebSocket with only the new input tail", async () => {
		ScriptedWebSocket.scripts = [
			(socket) => socket.emitEvents(completedResponse("resp_1", "First")),
			(socket) => socket.emitEvents(completedResponse("resp_2", "Second")),
		];
		vi.stubGlobal("WebSocket", ScriptedWebSocket);
		const options = {
			apiKey: token(),
			sessionId: "delta-session",
			transport: "websocket-cached" as const,
		};

		const first = await stream(model, userContext("First user"), options).result();
		const secondContext: Context = {
			systemPrompt: "Instructions",
			messages: [
				{ role: "user", content: "First user", timestamp: 1 },
				first,
				{ role: "user", content: "Second user", timestamp: 2 },
			],
		};
		const second = await stream(model, secondContext, options).result();

		expect(ScriptedWebSocket.opened).toBe(1);
		expect(ScriptedWebSocket.sent[1]?.previous_response_id).toBe("resp_1");
		expect(ScriptedWebSocket.sent[1]?.input).toEqual([
			{
				role: "user",
				content: [{ type: "input_text", text: "Second user" }],
			},
		]);
		expect(second.diagnostics?.at(-1)).toMatchObject({
			type: "openai_codex_cache",
			details: { transport: "websocket", socketReused: true, continuation: "delta" },
		});
		expect(getOpenAICodexWebSocketDebugStats("delta-session")).toMatchObject({
			requests: 2,
			connectionsCreated: 1,
			connectionsReused: 1,
			fullContextRequests: 1,
			deltaRequests: 1,
		});
	});
});
