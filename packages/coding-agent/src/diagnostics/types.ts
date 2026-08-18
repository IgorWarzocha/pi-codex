import type { CodexCompactionDiagnostic } from "../adapter/compaction/diagnostics.ts";

export type CodexDiagnosticsLane = "response" | "compaction" | "prewarm";
export type CodexDiagnosticsTransport = "websocket" | "sse";
export type CodexDiagnosticsFailureCategory =
	| "aborted"
	| "authentication"
	| "connection"
	| "connection_limit"
	| "message_too_big"
	| "overload"
	| "previous_response_missing"
	| "protocol"
	| "rate_limit"
	| "timeout"
	| "transport"
	| "unknown";
export interface CodexDiagnosticsFailure {
	category: CodexDiagnosticsFailureCategory;
	code?: string | undefined;
	status?: number | undefined;
}
export type CodexDiagnosticsEvent =
	| {
			type: "request";
			lane: CodexDiagnosticsLane;
			transport: CodexDiagnosticsTransport;
			attempt: number;
			fullInputItems: number;
			sentInputItems: number;
			model?: string | undefined;
			socketReused?: boolean | undefined;
			continuation?: string | undefined;
			canonicalHistory?: string | undefined;
			compaction?: CodexCompactionDiagnostic | undefined;
			previousResponseId?: boolean | undefined;
	  }
	| {
			type: "usage";
			lane: Exclude<CodexDiagnosticsLane, "prewarm">;
			transport: CodexDiagnosticsTransport;
			inputTokens: number;
			cachedInputTokens: number;
			cacheWriteInputTokens: number;
			outputTokens: number;
	  }
	| {
			type: "retry";
			lane: Exclude<CodexDiagnosticsLane, "prewarm">;
			transport: CodexDiagnosticsTransport;
			attempt: number;
			delayMs?: number | undefined;
			failure: CodexDiagnosticsFailure;
	  }
	| {
			type: "fallback";
			lane: Exclude<CodexDiagnosticsLane, "prewarm">;
			from: CodexDiagnosticsTransport;
			to: CodexDiagnosticsTransport;
			reason: "upgrade_required" | "message_too_big" | "unauthorized" | "retry_budget_exhausted";
	  }
	| {
			type: "failure";
			lane: CodexDiagnosticsLane;
			transport: CodexDiagnosticsTransport;
			failure: CodexDiagnosticsFailure;
	  }
	| { type: "prewarm-ready"; transport: "websocket"; socketReused: boolean };

export type CodexDiagnosticsSink = (event: CodexDiagnosticsEvent) => void;
