import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Model } from "@earendil-works/pi-ai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEventBus } from "../src/core/event-bus.ts";
import { createExtensionRuntime, loadExtensions } from "../src/core/extensions/loader.ts";
import { createAgentSession } from "../src/core/sdk.ts";
import { SessionManager } from "../src/core/session-manager.ts";
import { SettingsManager } from "../src/core/settings-manager.ts";
import { runCustomTool } from "../src/tools/code-mode/custom-tool-runner.ts";
import { parseCustomTool } from "../src/tools/code-mode/custom-tools.ts";
import { CodeModeDelegateRuntime } from "../src/tools/code-mode/delegate-runtime.ts";
import { parseRuntimeResponse } from "../src/tools/code-mode/host-protocol.ts";
import { acquireInstallLock, releaseInstallLock } from "../src/tools/code-mode/install-host.ts";
import {
	PREFLIGHT_AVAILABLE_CHANNEL,
	PREFLIGHT_PROTOCOL,
	PREFLIGHT_REQUEST_CHANNEL,
} from "../src/tools/code-mode/preflight-protocol.ts";
import { CodeModeRuntime } from "../src/tools/code-mode/runtime.ts";
import { scopeAllToolsToDeferredCustom } from "../src/tools/code-mode/tool-source.ts";
import type { CustomToolDefinition, ProgrammaticCodeModeToolDefinition } from "../src/tools/code-mode/types.ts";
import { CODE_MODE_TOOL_NAMES } from "../src/tools/runtime.ts";

const codeModeModel: Model<"openai-codex-responses"> = {
	id: "gpt-daybreak-blue-latest",
	name: "Daybreak Blue",
	api: "openai-codex-responses",
	provider: "openai-codex",
	baseUrl: "https://chatgpt.com/backend-api",
	reasoning: true,
	input: ["text", "image"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 272_000,
	maxTokens: 128_000,
};

describe("Pi-Codex Code Mode", () => {
	let tempDir: string;
	let agentDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `pi-code-mode-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		mkdirSync(agentDir, { recursive: true });
	});

	afterEach(() => {
		if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
	});

	it("selects Responses Lite and exposes only exec and wait for eligible models", async () => {
		const session = (
			await createAgentSession({
				cwd: tempDir,
				agentDir,
				model: codeModeModel,
				settingsManager: SettingsManager.inMemory(),
				sessionManager: SessionManager.inMemory(tempDir),
			})
		).session;

		expect(session.getActiveToolNames()).toEqual(CODE_MODE_TOOL_NAMES);
		expect(session.systemPrompt).toContain("Tools available in exec:");
		expect(session.systemPrompt).toContain("await tools.exec_command");
		expect(session.systemPrompt).not.toContain("Use exec_command for shell commands, file inspection");
		session.dispose();
	});

	it("keeps normal mode available as an explicit setting", async () => {
		const session = (
			await createAgentSession({
				cwd: tempDir,
				agentDir,
				model: codeModeModel,
				settingsManager: SettingsManager.inMemory({ executionMode: "normal" }),
				sessionManager: SessionManager.inMemory(tempDir),
			})
		).session;

		expect(session.getActiveToolNames()).not.toContain("exec");
		expect(session.getActiveToolNames()).toContain("exec_command");
		expect(session.systemPrompt).not.toContain("Tools available in exec:");
		session.dispose();
	});

	it("switches the native tool surface when execution mode changes", async () => {
		const settingsManager = SettingsManager.inMemory();
		const session = (
			await createAgentSession({
				cwd: tempDir,
				agentDir,
				model: codeModeModel,
				settingsManager,
				sessionManager: SessionManager.inMemory(tempDir),
			})
		).session;

		expect(session.getActiveToolNames()).toEqual(CODE_MODE_TOOL_NAMES);
		await session.setExecutionMode("normal");
		expect(session.getActiveToolNames()).toContain("exec_command");
		expect(session.getActiveToolNames()).not.toContain("exec");
		await session.setExecutionMode("code");
		expect(session.getActiveToolNames()).toEqual(CODE_MODE_TOOL_NAMES);
		session.dispose();
	});

	it("rejects malformed host runtime content", () => {
		expect(() =>
			parseRuntimeResponse({
				Result: { cell_id: "cell-1", content_items: [null] },
			}),
		).toThrow();
		expect(() =>
			parseRuntimeResponse({
				Result: { cell_id: "cell-1", content_items: [{ type: "input_audio" }] },
			}),
		).toThrow(/audio output is not supported/);
	});

	it("cancels active nested tools with their owning cell", async () => {
		const runtime = new CodeModeDelegateRuntime(() => undefined);
		let started = () => {};
		const active = new Promise<void>((resolve) => {
			started = resolve;
		});
		runtime.bindCell(
			"cell-a",
			{ cwd: tempDir },
			new Map([
				[
					"blocking",
					{
						name: "blocking",
						usage: "blocking({})",
						deferLoading: false,
						kind: "function",
						async invoke(_input, _context, signal) {
							started();
							await new Promise<void>((_resolve, reject) =>
								signal.addEventListener("abort", () => reject(new Error("nested tool cancelled")), {
									once: true,
								}),
							);
						},
					},
				],
			]),
		);
		const pending = runtime.invokeDirect("cell-a", 1, "blocking", {});
		await active;
		runtime.cancelCell("cell-a");
		await expect(pending).rejects.toThrow("nested tool cancelled");
	});

	it("runs extension preflights before nested invocation", async () => {
		const events = createEventBus();
		const runtime = new CodeModeRuntime({ agentDir, cwd: tempDir, getTools: () => [] });
		runtime.bindEvents(events);
		let available: unknown;
		events.on(PREFLIGHT_AVAILABLE_CHANNEL, (value) => {
			available = value;
		});
		events.emit(PREFLIGHT_REQUEST_CHANNEL, {
			protocol: PREFLIGHT_PROTOCOL,
		});
		const preflight = available as {
			register(callback: () => { block: true; reason: string }): () => void;
		};
		preflight.register(() => ({ block: true, reason: "Approval is required" }));
		await expect(
			runtime.preflight({
				toolName: "exec_command",
				input: { cmd: "rm -rf target" },
				toolCallId: "nested-blocked",
				cwd: tempDir,
				extensionContext: {} as never,
				signal: new AbortController().signal,
			}),
		).rejects.toThrow("Approval is required");
		await runtime.shutdown();
	});

	it("exposes only deferred configured tools through ALL_TOOLS", () => {
		const bundled: ProgrammaticCodeModeToolDefinition = {
			name: "exec_command",
			usage: "await tools.exec_command({ cmd })",
			deferLoading: false,
			kind: "function",
			inputSchema: { type: "object" },
			async invoke() {
				return "";
			},
		};
		const custom = (name: string, deferLoading: boolean): CustomToolDefinition => ({
			name,
			usage: `await tools.${name}(input)`,
			deferLoading,
			command: name,
			args: [],
			input: "arg",
			sourcePath: `/${name}.toml`,
		});
		const promoted = custom("promoted_tool", false);
		const deferred = custom("deferred_tool", true);
		const state = {
			ALL_TOOLS: [bundled, promoted, deferred].map(({ name, description }) => ({ name, description })),
		};
		Function("globalThis", scopeAllToolsToDeferredCustom("", [bundled, promoted, deferred]))(state);
		expect(state.ALL_TOOLS).toEqual([{ name: "deferred_tool", description: undefined }]);
	});

	it("parses and directly executes TOML custom tools", async () => {
		const scriptPath = join(tempDir, "echo-value.mjs");
		writeFileSync(scriptPath, "process.stdout.write(process.argv[2])");
		const tool = parseCustomTool(
			join(tempDir, "echo_value.toml"),
			[
				'usage = "await tools.echo_value(input)"',
				'command = "echo-value.mjs"',
				'input = "arg"',
				"defer_loading = false",
			].join("\n"),
		);
		expect(tool.command).toBe(process.execPath);
		expect(tool.args).toEqual([scriptPath]);
		expect(await runCustomTool(tool, "custom-ok", tempDir)).toBe("custom-ok");
	});

	it("does not release a host install lock replaced by another owner", async () => {
		const destination = join(tempDir, "codex-code-mode-host");
		const lockPath = `${destination}.lock`;
		const first = await acquireInstallLock(lockPath, destination, undefined);
		expect(first).toBeTypeOf("string");
		rmSync(lockPath, { recursive: true });
		const second = await acquireInstallLock(lockPath, destination, undefined);
		expect(second).toBeTypeOf("string");
		releaseInstallLock(lockPath, first!);
		expect(existsSync(lockPath)).toBe(true);
		releaseInstallLock(lockPath, second!);
		expect(existsSync(lockPath)).toBe(false);
	});

	it("rejects extension runtimes paired with a different event bus", async () => {
		const runtime = createExtensionRuntime();
		await expect(loadExtensions([], tempDir, createEventBus(), runtime)).rejects.toThrow(
			"must reference the same event bus",
		);
	});
});
