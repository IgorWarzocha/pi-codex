import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ExtensionContext } from "../src/core/extensions/types.ts";
import { createApplyPatchTool } from "../src/tools/apply-patch/tool.ts";
import { consumeOutput, peekOutputSince, truncateOutput, truncateToTail } from "../src/tools/exec/output.ts";
import { createExecSessionManager } from "../src/tools/exec/session-manager.ts";

describe("native Pi-Codex tools", () => {
	let testDir: string | undefined;

	afterEach(() => {
		if (testDir && existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
		testDir = undefined;
	});

	it("keeps exec output deltas valid after bounded-buffer rollover", () => {
		const session = { buffer: "abcdefghij", bufferStartOffset: 0, emittedOffset: 0 };

		expect(consumeOutput(session).output).toBe("abcdefghij");
		const baselineOffset = session.bufferStartOffset + session.buffer.length;
		const firstRollover = truncateToTail(`${session.buffer}klm`, 10);
		session.buffer = firstRollover.output;
		session.bufferStartOffset += firstRollover.removed;
		expect(peekOutputSince(session, baselineOffset).output).toBe("klm");
		expect(consumeOutput(session).output).toBe("klm");

		const secondRollover = truncateToTail(`${session.buffer}nopqrstuvwxyzABCDEFG`, 10);
		session.buffer = secondRollover.output;
		session.bufferStartOffset += secondRollover.removed;
		expect(consumeOutput(session)).toEqual({ output: "xyzABCDEFG", original_token_count: 5 });
		expect(truncateToTail(`${"x".repeat(4)}😀z`, 2).output).toBe("z");
		expect(truncateOutput(`x😀${"y".repeat(255)}`, 1).output).toBe("y".repeat(255));
	});

	it("executes commands through the bundled exec bridge", async () => {
		const sessions = createExecSessionManager({ minNonInteractiveExecYieldTimeMs: 10 });
		try {
			const result = await sessions.exec(
				{ cmd: `${JSON.stringify(process.execPath)} -e ${JSON.stringify("process.stdout.write('native-ok')")}` },
				process.cwd(),
			);
			expect(result).toMatchObject({ output: "native-ok", exit_code: 0 });
			expect(result.session_id).toBeUndefined();
		} finally {
			await sessions.shutdown();
		}
	});

	it("applies file edits through the bundled Codex patch engine", async () => {
		testDir = join(tmpdir(), `pi-codex-patch-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(testDir, { recursive: true });
		writeFileSync(join(testDir, "example.txt"), "before\n");
		const tool = createApplyPatchTool();
		const context = { cwd: testDir } as ExtensionContext;

		const result = await tool.execute(
			"patch-1",
			{
				input: "*** Begin Patch\n*** Update File: example.txt\n@@\n-before\n+after\n*** End Patch",
			},
			undefined,
			undefined,
			context,
		);

		expect(readFileSync(join(testDir, "example.txt"), "utf8")).toBe("after\n");
		expect(result.content[0]).toMatchObject({ type: "text", text: expect.stringContaining("Applied patch") });
	});
});
