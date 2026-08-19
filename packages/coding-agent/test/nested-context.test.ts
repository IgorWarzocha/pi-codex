import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NESTED_CONTEXT_DETAILS_KEY, NestedContextManager } from "../src/core/nested-context/index.ts";

describe("NestedContextManager", () => {
	let root: string;
	let filePath: string;

	beforeEach(() => {
		root = join(tmpdir(), `nested-context-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		filePath = join(root, "packages", "app", "src", "index.ts");
		mkdirSync(join(root, ".git"), { recursive: true });
		mkdirSync(join(root, "packages", "app", "src"), { recursive: true });
		writeFileSync(join(root, "AGENTS.md"), "root instructions");
		writeFileSync(join(root, "packages", "AGENTS.md"), "package instructions");
		writeFileSync(join(root, "packages", "app", "AGENTS.md"), "app instructions");
		writeFileSync(filePath, "export const value = 1;\n");
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	function manager(messages: readonly AgentMessage[] = []): NestedContextManager {
		return new NestedContextManager({
			cwd: root,
			enabled: true,
			startupFiles: [{ path: join(root, "AGENTS.md"), content: "root instructions" }],
			messages,
		});
	}

	function lastText(result: Awaited<ReturnType<NestedContextManager["transform"]>>): string {
		const item = result?.content.at(-1);
		return item?.type === "text" ? item.text : "";
	}

	it("loads the applicable nested chain once and persists it with the tool result", async () => {
		const context = manager();
		const first = await context.transform({
			toolName: "exec_command",
			input: { cmd: `sed -n '1,5p' ${filePath}` },
			content: [{ type: "text", text: "export const value = 1;" }],
			details: {},
			isError: false,
		});

		expect(lastText(first)).toContain('<agents_file path="packages/AGENTS.md">');
		expect(lastText(first)).toContain('<agents_file path="packages/app/AGENTS.md">');
		expect(lastText(first)).not.toContain("root instructions");
		expect(first?.details[NESTED_CONTEXT_DETAILS_KEY]).toEqual({
			files: [
				{ path: "packages/AGENTS.md", content: "package instructions" },
				{ path: "packages/app/AGENTS.md", content: "app instructions" },
			],
		});

		const second = await context.transform({
			toolName: "exec_command",
			input: { cmd: `cat ${filePath}` },
			content: [{ type: "text", text: "export const value = 1;" }],
			details: {},
			isError: false,
		});
		expect(second).toBeUndefined();
	});

	it("restores persisted context and refreshes a changed nested file", async () => {
		const persisted = {
			[NESTED_CONTEXT_DETAILS_KEY]: {
				files: [
					{ path: "packages/AGENTS.md", content: "package instructions" },
					{ path: "packages/app/AGENTS.md", content: "app instructions" },
				],
			},
		};
		const messages = [
			{
				role: "toolResult",
				toolCallId: "call-1",
				toolName: "exec_command",
				content: [{ type: "text", text: "result" }],
				isError: false,
				timestamp: Date.now(),
				details: persisted,
			},
		] satisfies AgentMessage[];
		const context = manager(messages);
		writeFileSync(join(root, "packages", "app", "AGENTS.md"), "updated app instructions");

		const refreshed = await context.transform({
			toolName: "read",
			input: { path: filePath },
			content: [{ type: "text", text: "export const value = 1;" }],
			details: {},
			isError: false,
		});

		expect(refreshed?.details[NESTED_CONTEXT_DETAILS_KEY]).toEqual({
			files: [{ path: "packages/app/AGENTS.md", content: "updated app instructions" }],
		});
	});

	it("does not repeat a context file the agent read directly", async () => {
		const context = manager();
		const direct = await context.transform({
			toolName: "read",
			input: { path: join(root, "packages", "AGENTS.md") },
			content: [{ type: "text", text: "package instructions" }],
			details: {},
			isError: false,
		});
		expect(lastText(direct)).toBe("package instructions");

		const nested = await context.transform({
			toolName: "read",
			input: { path: filePath },
			content: [{ type: "text", text: "export const value = 1;" }],
			details: {},
			isError: false,
		});
		expect(lastText(nested)).not.toContain('<agents_file path="packages/AGENTS.md">');
		expect(lastText(nested)).toContain('<agents_file path="packages/app/AGENTS.md">');
	});

	it("uses AGENTS.override.md and sees read-like tools executed inside Code Mode", async () => {
		writeFileSync(join(root, "packages", "app", "AGENTS.override.md"), "local override");
		const context = manager();
		const result = await context.transform({
			toolName: "exec",
			input: { code: "await tools.exec_command(...)" },
			content: [{ type: "text", text: "Script completed" }],
			details: {
				codeMode: true,
				traces: [
					{
						status: "done",
						name: "exec_command",
						input: { cmd: `cat ${filePath}` },
						result: { content: [{ type: "text", text: "export const value = 1;" }] },
					},
				],
			},
			isError: false,
		});

		expect(lastText(result)).toContain("local override");
		expect(lastText(result)).not.toContain("app instructions");
	});
});
