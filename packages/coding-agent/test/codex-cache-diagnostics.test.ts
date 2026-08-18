import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { test } from "vitest";
import { codexDiagnosticsFailure } from "../src/diagnostics/failure.ts";
import { codexDiagnosticsLogPath, createCodexDiagnosticsLog } from "../src/diagnostics/logger.ts";

test("cache diagnostics log is session-derived, readable, and omits raw provider payloads", async () => {
	const agentDir = await mkdtemp(join(tmpdir(), "pi-codex-log-"));
	try {
		const sessionId = "019fd7ca-66ba-7c47-8925-d2cdc17e2bd7";
		const sessionFile = `/sessions/2026-08-06T15-56-33-850Z_${sessionId}.jsonl`;
		const path = codexDiagnosticsLogPath({
			agentDir,
			sessionId,
			sessionFile,
			sessionName: "../../ Cache Test",
		});
		assert.equal(dirname(path), join(agentDir, "pi-codex-logs"));
		assert.match(basename(path), /^Cache-Test--2026-08-06T15-56-33-850Z_/);

		const errors: unknown[] = [];
		const log = await createCodexDiagnosticsLog({
			agentDir,
			sessionId,
			sessionFile,
			sessionName: "../../ Cache Test",
			cwd: "/work/project",
			onError: (error) => errors.push(error),
		});
		const providerFailure = Object.assign(new Error("Unauthorized response resp_secret Bearer secret"), {
			code: "invalid_token",
			status: 401,
			payload: { response: { id: "resp_secret", echoed_prompt: "private" } },
		});
		const safeFailure = codexDiagnosticsFailure(providerFailure);
		assert.deepEqual(safeFailure, {
			category: "authentication",
			code: "invalid_token",
			status: 401,
		});
		log.record({
			type: "request",
			lane: "compaction",
			transport: "websocket",
			attempt: 1,
			fullInputItems: 43,
			sentInputItems: 43,
			model: "gpt-5.6-sol",
			socketReused: false,
			continuation: "no_continuation",
			canonicalHistory: "validated",
			compaction: {
				model: "gpt-5.6-sol",
				inputSource: "reconstructed",
				canonicalReplay: "response_prefix_mismatch",
				checkpointReused: true,
				checkpointModel: "gpt-5.6-luna",
				rewrittenToolOutputs: 2,
			},
			previousResponseId: false,
		});
		log.record({
			type: "failure",
			lane: "compaction",
			transport: "websocket",
			failure: safeFailure,
		});
		await log.close();

		const contents = await readFile(log.path, "utf8");
		assert.match(contents, /Metadata only/);
		assert.match(contents, /event="request" lane="compaction" transport="websocket"/);
		assert.match(contents, /canonical_history="validated"/);
		assert.match(contents, /full_input_items=43 sent_input_items=43/);
		assert.match(contents, /model="gpt-5.6-sol"/);
		assert.match(
			contents,
			/compaction_source="reconstructed" compaction_replay="response_prefix_mismatch" checkpoint_reused=true checkpoint_model="gpt-5.6-luna" rewritten_tool_outputs=2/,
		);
		assert.match(contents, /failure="authentication" code="invalid_token" status=401/);
		assert.doesNotMatch(contents, /error=|resp_secret|echoed_prompt|Bearer/);
		assert.deepEqual(errors, []);
	} finally {
		await rm(agentDir, { recursive: true, force: true });
	}
});
