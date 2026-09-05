import { afterEach, expect, it, vi } from "vitest";
import { closeOpenAICodexWebSocketSessions, streamSimple } from "../src/api/openai-codex-responses.ts";
import type { Context, Model } from "../src/types.ts";

afterEach(() => {
	closeOpenAICodexWebSocketSessions();
	vi.unstubAllGlobals();
});

it("keeps summary routing but leaves the main cached websocket continuation untouched", async () => {
	const sockets: MockWebSocket[] = [];
	const requests: Array<{
		socket: MockWebSocket;
		body: { input: unknown[]; prompt_cache_key?: string; previous_response_id?: string };
	}> = [];
	class MockWebSocket extends EventTarget {
		static OPEN = 1;
		readyState = MockWebSocket.OPEN;
		headers: Record<string, string> | undefined;
		constructor(_url: string, options?: { headers?: Record<string, string> }) {
			super();
			this.headers = options?.headers;
			sockets.push(this);
			queueMicrotask(() => this.dispatchEvent(new Event("open")));
		}
		send(data: string) {
			requests.push({ socket: this, body: JSON.parse(data) });
			const id = `resp_${requests.length}`;
			queueMicrotask(() => {
				for (const event of [
					{ type: "response.created", response: { id } },
					{
						type: "response.completed",
						response: { id, status: "completed", usage: { input_tokens: 1, output_tokens: 0, total_tokens: 1 } },
					},
				]) {
					this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(event) }));
				}
			});
		}
		close() {
			this.readyState = 3;
		}
	}
	vi.stubGlobal("WebSocket", MockWebSocket);
	const model: Model<"openai-codex-responses"> = {
		id: "gpt-5.1-codex",
		name: "Codex",
		api: "openai-codex-responses",
		provider: "openai-codex",
		baseUrl: "https://chatgpt.com/backend-api",
		reasoning: true,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 400000,
		maxTokens: 128000,
	};
	const payload = Buffer.from(
		JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "test" } }),
	).toString("base64");
	const options = { apiKey: `aaa.${payload}.bbb`, sessionId: "live-session", transport: "websocket-cached" as const };
	const context: Context = {
		systemPrompt: "Normal system",
		messages: [{ role: "user", content: "First", timestamp: 1 }],
	};
	expect((await streamSimple(model, context, options).result()).stopReason).toBe("stop");
	const followup: Context = {
		...context,
		messages: [...context.messages, { role: "user", content: "Next", timestamp: 2 }],
	};
	expect((await streamSimple(model, followup, { ...options, isolateSession: true }).result()).stopReason).toBe("stop");
	expect(sockets).toHaveLength(2);
	expect(sockets[1].readyState).toBe(3);
	expect(sockets[0].readyState).toBe(1);
	expect((await streamSimple(model, followup, options).result()).stopReason).toBe("stop");
	expect(sockets).toHaveLength(2);
	expect(requests.map((request) => request.body.prompt_cache_key)).toEqual([
		"live-session",
		"live-session",
		"live-session",
	]);
	expect(sockets.map((socket) => socket.headers?.["session-id"])).toEqual(["live-session", "live-session"]);
	expect(requests[1].body.previous_response_id).toBeUndefined();
	expect(requests[1].body.input).toHaveLength(2);
	expect(requests[2].socket).toBe(sockets[0]);
	expect(requests[2].body.previous_response_id).toBe("resp_1");
	expect(requests[2].body.input).toHaveLength(1);
});
