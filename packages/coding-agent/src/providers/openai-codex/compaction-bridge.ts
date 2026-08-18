import type { ProviderHeaders } from "@earendil-works/pi-ai";

export interface ResponsesBody {
	model: string;
	input: unknown[];
	previous_response_id?: string | undefined;
	reasoning?:
		| { context?: "all_turns" | undefined; effort?: string | undefined; summary?: string | undefined }
		| undefined;
	service_tier?: string | undefined;
	temperature?: number | undefined;
	text: { verbosity: string };
	client_metadata?: Record<string, string> | undefined;
	[key: string]: unknown;
}

interface CanonicalSessionState {
	accountId: string;
	url: string;
	requestBody: ResponsesBody;
	reconstructedRequestInput: readonly unknown[];
	responseItems: readonly unknown[];
}

interface CanonicalSessionRegistry {
	sessions: Map<string, CanonicalSessionState>;
}

export type CanonicalCompactionReplayDecision =
	| "validated"
	| "no_state"
	| "model_mismatch"
	| "identity_mismatch"
	| "input_shorter_than_baseline"
	| "request_prefix_mismatch"
	| "response_prefix_mismatch";

const registryKey = Symbol.for("@earendil-works/pi-ai/openai-codex-canonical-sessions");

function canonicalSessions(): Map<string, CanonicalSessionState> {
	const registry = (globalThis as typeof globalThis & { [key: symbol]: unknown })[registryKey];
	return registry && typeof registry === "object" && "sessions" in registry
		? (registry as CanonicalSessionRegistry).sessions
		: new Map();
}

function canonicalValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalValue);
	if (!value || typeof value !== "object") return value;
	const record = value as Record<string, unknown>;
	const canonical: Record<string, unknown> = {};
	for (const key of Object.keys(record).sort()) {
		if (key === "internal_chat_message_metadata_passthrough") continue;
		if (
			key === "logprobs" &&
			record["type"] === "output_text" &&
			Array.isArray(record[key]) &&
			record[key].length === 0
		)
			continue;
		if (
			key === "status" &&
			record[key] === "completed" &&
			(record["type"] === "function_call" || record["type"] === "custom_tool_call")
		)
			continue;
		canonical[key] = canonicalValue(record[key]);
	}
	return canonical;
}

function valuesEqual(left: readonly unknown[], right: readonly unknown[]): boolean {
	return (
		left.length === right.length &&
		left.every(
			(value, index) => JSON.stringify(canonicalValue(value)) === JSON.stringify(canonicalValue(right[index])),
		)
	);
}

function materializedInput(state: CanonicalSessionState): unknown[] {
	return [...state.requestBody.input, ...state.responseItems];
}

function responsesLitePrefixLength(input: readonly unknown[]): number {
	const first = input[0];
	if (!first || typeof first !== "object" || (first as { type?: unknown }).type !== "additional_tools") return 0;
	const second = input[1];
	return second && typeof second === "object" && (second as { role?: unknown }).role === "developer" ? 2 : 1;
}

export function resolveCanonicalCompactionPromptInput(
	sessionId: string,
	model: string,
	identity?: { url: string; accountId: string } | undefined,
	reconstructedInput?: readonly unknown[] | undefined,
): { input?: unknown[] | undefined; decision: CanonicalCompactionReplayDecision } {
	const state = canonicalSessions().get(sessionId);
	if (!state) return { decision: "no_state" };
	if (state.requestBody.model !== model) return { decision: "model_mismatch" };
	if (identity && (state.url !== identity.url || state.accountId !== identity.accountId))
		return { decision: "identity_mismatch" };
	if (!reconstructedInput) return { input: structuredClone(materializedInput(state)), decision: "validated" };
	const baseline = state.reconstructedRequestInput.slice(responsesLitePrefixLength(state.reconstructedRequestInput));
	const minimum = baseline.length + state.responseItems.length;
	if (reconstructedInput.length < minimum) return { decision: "input_shorter_than_baseline" };
	if (!valuesEqual(reconstructedInput.slice(0, baseline.length), baseline))
		return { decision: "request_prefix_mismatch" };
	const responseEnd = baseline.length + state.responseItems.length;
	if (!valuesEqual(reconstructedInput.slice(baseline.length, responseEnd), state.responseItems))
		return { decision: "response_prefix_mismatch" };
	return {
		input: [...structuredClone(materializedInput(state)), ...structuredClone(reconstructedInput.slice(responseEnd))],
		decision: "validated",
	};
}

export function canonicalCompactionPromptInput(
	sessionId: string,
	model: string,
	identity?: { url: string; accountId: string } | undefined,
): unknown[] | undefined {
	return resolveCanonicalCompactionPromptInput(sessionId, model, identity).input;
}

export function canonicalCompactionRequestBody(
	sessionId: string,
	model: string,
	identity: { url: string; accountId: string },
): ResponsesBody | undefined {
	const state = canonicalSessions().get(sessionId);
	if (
		!state ||
		state.requestBody.model !== model ||
		state.url !== identity.url ||
		state.accountId !== identity.accountId
	)
		return undefined;
	const body = structuredClone({ ...state.requestBody, input: [] });
	delete body.previous_response_id;
	return body;
}

export function extractAccountId(token: string): string {
	try {
		const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64").toString("utf8"));
		const accountId = payload?.["https://api.openai.com/auth"]?.chatgpt_account_id;
		if (typeof accountId !== "string" || !accountId) throw new Error("missing account");
		return accountId;
	} catch {
		throw new Error("Failed to extract accountId from token");
	}
}

export function resolveCodexWebSocketUrl(baseUrl: string | undefined): string {
	const normalized = (baseUrl?.trim() || "https://chatgpt.com/backend-api").replace(/\/+$/, "");
	const responseUrl = normalized.endsWith("/codex/responses")
		? normalized
		: normalized.endsWith("/codex")
			? `${normalized}/responses`
			: `${normalized}/codex/responses`;
	const url = new URL(responseUrl);
	url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
	return url.toString();
}

export function withRemoteCompactionV2Feature(headers: ProviderHeaders | undefined): ProviderHeaders {
	return { ...headers, "OpenAI-Beta": "responses=compaction-2025-11-30" };
}

export async function sleep(delayMs: number, signal?: AbortSignal): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(resolve, delayMs);
		const abort = () => {
			clearTimeout(timeout);
			reject(new Error("Request was aborted"));
		};
		signal?.addEventListener("abort", abort, { once: true });
		if (signal?.aborted) abort();
	});
}
