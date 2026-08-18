import { normalizeTimeoutMs } from "./sse.ts";
import type { OpenAICodexStreamOptions } from "./types.ts";

export { parseWebSocket, startWebSocketOutputOnFirstEvent } from "./websocket-parser.ts";
export type { OpenAICodexWebSocketDebugStats } from "./websocket-session-cache.ts";
export {
	acquireWebSocket,
	closeOpenAICodexWebSocketSessions,
	getOpenAICodexWebSocketDebugStats,
	isWebSocketSseFallbackActive,
	recordWebSocketFailure,
	recordWebSocketRequest,
	recordWebSocketSseFallback,
	resetOpenAICodexWebSocketDebugStats,
	resetOpenAICodexWebSocketSessions,
} from "./websocket-session-cache.ts";

export function validateWebSocketTimeoutOptions(options: OpenAICodexStreamOptions | undefined): void {
	normalizeTimeoutMs(options?.timeoutMs, "timeoutMs");
	normalizeTimeoutMs(options?.websocketConnectTimeoutMs, "websocketConnectTimeoutMs");
}
