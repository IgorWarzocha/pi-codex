import { createHash } from "node:crypto";
import type { ProviderEnv } from "../../types.ts";
import { clearCanonicalSessions } from "./session-continuity.ts";
import type { AcquiredWebSocket, SessionWebSocketCacheEntry } from "./types.ts";
import {
	closeWebSocketSilently,
	connectWebSocket,
	isWebSocketReusable,
	resolveWebSocketProxyForTarget,
} from "./websocket-connection.ts";

const websocketSessionCache = new Map<string, Map<string, SessionWebSocketCacheEntry>>();
const websocketSseFallbackSessions = new Set<string>();
const websocketDebugStats = new Map<string, OpenAICodexWebSocketDebugStats>();
const CONTINUATION_HEADERS = new Set([
	"openai-beta",
	"session-id",
	"thread-id",
	"x-client-request-id",
	"x-codex-beta-features",
]);

export interface OpenAICodexWebSocketDebugStats {
	requests: number;
	connectionsCreated: number;
	connectionsReused: number;
	cachedContextRequests: number;
	storeTrueRequests: number;
	fullContextRequests: number;
	deltaRequests: number;
	lastInputItems: number;
	lastDeltaInputItems?: number;
	lastPreviousResponseId?: string;
	websocketFailures: number;
	sseFallbacks: number;
	websocketFallbackActive?: boolean;
	lastWebSocketError?: string;
}

function debugStats(sessionId: string): OpenAICodexWebSocketDebugStats {
	let stats = websocketDebugStats.get(sessionId);
	if (!stats) {
		stats = {
			requests: 0,
			connectionsCreated: 0,
			connectionsReused: 0,
			cachedContextRequests: 0,
			storeTrueRequests: 0,
			fullContextRequests: 0,
			deltaRequests: 0,
			lastInputItems: 0,
			websocketFailures: 0,
			sseFallbacks: 0,
		};
		websocketDebugStats.set(sessionId, stats);
	}
	return stats;
}

export function getOpenAICodexWebSocketDebugStats(sessionId: string): OpenAICodexWebSocketDebugStats | undefined {
	const stats = websocketDebugStats.get(sessionId);
	return stats ? { ...stats } : undefined;
}

export function resetOpenAICodexWebSocketDebugStats(sessionId?: string): void {
	if (sessionId) {
		websocketDebugStats.delete(sessionId);
		websocketSseFallbackSessions.delete(sessionId);
		return;
	}
	websocketDebugStats.clear();
	websocketSseFallbackSessions.clear();
}

export function recordWebSocketRequest(
	sessionId: string | undefined,
	options: {
		reused: boolean;
		cached: boolean;
		store: boolean;
		inputItems: number;
		previousResponseId?: string;
	},
): void {
	if (!sessionId) return;
	const stats = debugStats(sessionId);
	stats.requests++;
	if (options.reused) stats.connectionsReused++;
	else stats.connectionsCreated++;
	if (options.cached) stats.cachedContextRequests++;
	if (options.store) stats.storeTrueRequests++;
	stats.lastInputItems = options.inputItems;
	if (options.previousResponseId) {
		stats.deltaRequests++;
		stats.lastDeltaInputItems = options.inputItems;
		stats.lastPreviousResponseId = options.previousResponseId;
	} else {
		stats.fullContextRequests++;
		delete stats.lastDeltaInputItems;
		delete stats.lastPreviousResponseId;
	}
}

export function recordWebSocketFailure(sessionId: string | undefined, error: unknown): void {
	if (!sessionId) return;
	const stats = debugStats(sessionId);
	stats.websocketFailures++;
	stats.lastWebSocketError = error instanceof Error ? error.message : String(error);
	stats.websocketFallbackActive = true;
}

function routeIdentityHeaders(headers: Headers): [string, string][] {
	return [...headers.entries()]
		.filter(([name]) => !CONTINUATION_HEADERS.has(name.toLowerCase()))
		.sort(([left], [right]) => left.localeCompare(right));
}

async function websocketRouteKey(
	url: string,
	headers: Headers,
	accountId: string,
	env: ProviderEnv | undefined,
): Promise<string> {
	const proxy = await resolveWebSocketProxyForTarget(url, env);
	const handshakeIdentity = JSON.stringify([
		accountId,
		new URL(url).href,
		proxy ?? null,
		routeIdentityHeaders(headers),
	]);
	return createHash("sha256").update(handshakeIdentity).digest("base64url");
}

export function isWebSocketSseFallbackActive(sessionId: string | undefined): boolean {
	return sessionId ? websocketSseFallbackSessions.has(sessionId) : false;
}

export function recordWebSocketSseFallback(sessionId: string | undefined): void {
	if (!sessionId) return;
	websocketSseFallbackSessions.add(sessionId);
	const stats = debugStats(sessionId);
	stats.sseFallbacks++;
	stats.websocketFallbackActive = true;
}

function closeWebSocketSessions(sessionId: string | undefined): void {
	const closeEntry = (entry: SessionWebSocketCacheEntry) => {
		closeWebSocketSilently(entry.socket, 1000, "session_shutdown");
	};

	if (sessionId) {
		for (const entry of websocketSessionCache.get(sessionId)?.values() ?? []) closeEntry(entry);
		websocketSessionCache.delete(sessionId);
		return;
	}

	for (const routeEntries of websocketSessionCache.values()) {
		for (const entry of routeEntries.values()) closeEntry(entry);
	}
	websocketSessionCache.clear();
}

export function resetOpenAICodexWebSocketSessions(sessionId?: string): void {
	closeWebSocketSessions(sessionId);
	clearCanonicalSessions(sessionId);
}

export function closeOpenAICodexWebSocketSessions(sessionId?: string): void {
	closeWebSocketSessions(sessionId);
	clearCanonicalSessions(sessionId);
	if (sessionId) {
		websocketSseFallbackSessions.delete(sessionId);
		return;
	}
	websocketSseFallbackSessions.clear();
}

export async function acquireWebSocket(
	url: string,
	headers: Headers,
	sessionId: string | undefined,
	accountId: string,
	signal: AbortSignal | undefined,
	connectTimeoutMs?: number,
	env?: ProviderEnv,
): Promise<AcquiredWebSocket> {
	if (!sessionId) {
		const socket = await connectWebSocket(url, headers, signal, connectTimeoutMs, env);
		return {
			socket,
			reused: false,
			release: ({ keep } = {}) => {
				if (keep === false) {
					closeWebSocketSilently(socket);
					return;
				}
				closeWebSocketSilently(socket);
			},
		};
	}

	const routeKey = await websocketRouteKey(url, headers, accountId, env);
	let routeEntries = websocketSessionCache.get(sessionId);
	const cached = routeEntries?.get(routeKey);
	if (cached) {
		if (!cached.busy && isWebSocketReusable(cached.socket)) {
			cached.busy = true;
			return {
				socket: cached.socket,
				entry: cached,
				reused: true,
				release: ({ keep } = {}) => {
					if (!keep || !isWebSocketReusable(cached.socket)) {
						closeWebSocketSilently(cached.socket);
						const currentEntries = websocketSessionCache.get(sessionId);
						if (currentEntries?.get(routeKey) === cached) currentEntries.delete(routeKey);
						if (currentEntries?.size === 0) websocketSessionCache.delete(sessionId);
						return;
					}
					cached.busy = false;
				},
			};
		}

		if (cached.busy) {
			const socket = await connectWebSocket(url, headers, signal, connectTimeoutMs, env);
			return {
				socket,
				reused: false,
				release: () => {
					closeWebSocketSilently(socket);
				},
			};
		}

		if (!isWebSocketReusable(cached.socket)) {
			closeWebSocketSilently(cached.socket);
			routeEntries?.delete(routeKey);
			if (routeEntries?.size === 0) websocketSessionCache.delete(sessionId);
		}
	}

	const socket = await connectWebSocket(url, headers, signal, connectTimeoutMs, env);
	const entry: SessionWebSocketCacheEntry = { socket, busy: true };
	routeEntries = websocketSessionCache.get(sessionId);
	if (!routeEntries) {
		routeEntries = new Map();
		websocketSessionCache.set(sessionId, routeEntries);
	}
	routeEntries.set(routeKey, entry);
	return {
		socket,
		entry,
		reused: false,
		release: ({ keep } = {}) => {
			if (!keep || !isWebSocketReusable(entry.socket)) {
				closeWebSocketSilently(entry.socket);
				const currentEntries = websocketSessionCache.get(sessionId);
				if (currentEntries?.get(routeKey) === entry) currentEntries.delete(routeKey);
				if (currentEntries?.size === 0) websocketSessionCache.delete(sessionId);
				return;
			}
			entry.busy = false;
		},
	};
}
