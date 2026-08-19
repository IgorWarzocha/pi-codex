import { Type } from "typebox";
import { describe, expect, it } from "vitest";
import type { ExtensionFactory } from "../../../src/index.ts";
import { createHarness } from "../harness.ts";

function toolNames(tools: Array<{ name: string }>): string[] {
	return tools.map((tool) => tool.name).sort();
}

describe("regression #5109: exclude tools", () => {
	const extensionFactories: ExtensionFactory[] = [
		(pi) => {
			pi.on("session_start", () => {
				pi.registerTool({
					name: "ask_question",
					label: "Ask Question",
					description: "Ask a question",
					promptSnippet: "Ask a question",
					parameters: Type.Object({}),
					execute: async () => ({
						content: [{ type: "text", text: "ok" }],
						details: {},
					}),
				});
				pi.registerTool({
					name: "dynamic_tool",
					label: "Dynamic Tool",
					description: "Dynamic test tool",
					promptSnippet: "Run dynamic test behavior",
					parameters: Type.Object({}),
					execute: async () => ({
						content: [{ type: "text", text: "ok" }],
						details: {},
					}),
				});
			});
		},
	];

	it("filters built-in and extension tools from available and active tools", async () => {
		const harness = await createHarness({
			excludedToolNames: ["wait", "ask_question"],
			extensionFactories,
		});
		try {
			await harness.session.bindExtensions({});

			const allToolNames = toolNames(harness.session.getAllTools());
			expect(allToolNames).not.toContain("wait");
			expect(allToolNames).not.toContain("ask_question");
			expect(allToolNames).toContain("exec");
			expect(allToolNames).toContain("dynamic_tool");
			expect(harness.session.getActiveToolNames().sort()).toEqual(["dynamic_tool", "exec"]);
			expect(harness.session.systemPrompt).not.toContain("ask_question");
			expect(harness.session.systemPrompt).not.toContain("Run dynamic test behavior");
		} finally {
			harness.cleanup();
		}
	});

	it("lets excluded tools override the allowlist", async () => {
		const harness = await createHarness({
			allowedToolNames: ["exec", "wait", "ask_question"],
			excludedToolNames: ["wait", "ask_question"],
			initialActiveToolNames: ["exec", "wait", "ask_question"],
			extensionFactories,
		});
		try {
			await harness.session.bindExtensions({});

			expect(toolNames(harness.session.getAllTools())).toEqual(["exec"]);
			expect(harness.session.getActiveToolNames()).toEqual(["exec"]);
			expect(harness.session.systemPrompt).not.toContain("ask_question");
		} finally {
			harness.cleanup();
		}
	});
});
