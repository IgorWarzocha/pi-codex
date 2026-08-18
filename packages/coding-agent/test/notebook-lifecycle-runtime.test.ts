import assert from "node:assert/strict";
import { getHeapStatistics } from "node:v8";
import { test } from "vitest";
import { normalizeNotebookRequest } from "../src/tools/code-mode/notebook-tool.ts";
import { notebookStatusSource } from "../src/tools/notebook-mode/lifecycle-runtime.ts";

test("strict notebook null placeholders are treated as absent", () => {
	assert.deepEqual(
		normalizeNotebookRequest({
			action: "status",
			query: null,
			name: null,
			names: null,
		} as never),
		{ action: "status" },
	);
});

test("notebook status does not invoke binding metadata getters", async () => {
	let getterCalls = 0;
	class Resource {
		[Symbol.dispose]() {}
	}
	const probe = new Resource();
	for (const key of ["constructor", Symbol.asyncDispose, Symbol.toStringTag]) {
		Object.defineProperty(probe, key, {
			get() {
				getterCalls += 1;
				throw new Error("getter invoked");
			},
		});
	}
	let output = "";
	const source = notebookStatusSource(["probe"], "MARKER").replace(
		'const { getHeapStatistics } = await import("node:v8");',
		"",
	);
	const run = new Function("Deno", "console", "probe", "getHeapStatistics", `return (async () => ${source})()`);
	await run(
		{ memoryUsage: () => ({ heapUsed: 1, heapTotal: 2, rss: 3, external: 4 }) },
		{
			log: (value: string) => {
				output += value;
			},
		},
		probe,
		getHeapStatistics,
	);

	assert.equal(getterCalls, 0);
	assert.match(output, /^MARKER\{"memory":/);
	assert.match(output, /"disposable":"sync"/);
});
