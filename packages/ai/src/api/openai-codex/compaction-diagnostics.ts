export type CodexCompactionReplayDecision =
	| "validated"
	| "not_applicable"
	| "no_state"
	| "model_mismatch"
	| "identity_mismatch"
	| "input_shorter_than_baseline"
	| "request_prefix_mismatch"
	| "response_prefix_mismatch";

export interface CodexCompactionDiagnostic {
	model?: string;
	inputSource: "canonical" | "reconstructed";
	canonicalReplay: CodexCompactionReplayDecision;
	checkpointReused: boolean;
	checkpointModel?: string;
	transport?: "websocket" | "sse";
	continuation?: WebSocketContinuationDecision;
	previousResponseId?: boolean;
	fullInputItems?: number;
	sentInputItems?: number;
	rewrittenToolOutputs?: number;
}

type WebSocketContinuationDecision =
	| "disabled"
	| "no_session_cache_entry"
	| "no_continuation"
	| "body_mismatch"
	| "input_shorter_than_baseline"
	| "input_prefix_mismatch"
	| "missing_previous_response_id"
	| "delta";
