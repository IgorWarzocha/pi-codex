import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getModel } from "@earendil-works/pi-ai/compat";
import { Type } from "typebox";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAgentSessionFromServices, createAgentSessionServices } from "../src/core/agent-session-services.ts";
import { DefaultResourceLoader } from "../src/core/resource-loader.ts";
import { type CreateAgentSessionOptions, createAgentSession, type InlineExtension } from "../src/core/sdk.ts";
import { SessionManager } from "../src/core/session-manager.ts";
import { SettingsManager } from "../src/core/settings-manager.ts";
import { ALL_CODEX_TOOL_NAMES, DEFAULT_CODEX_TOOL_NAMES } from "../src/tools/runtime.ts";

type ToolOptions = Pick<CreateAgentSessionOptions, "tools" | "excludeTools" | "noTools" | "customTools">;

describe("Pi-Codex default tools", () => {
	let tempDir: string;
	let agentDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `pi-codex-tools-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		agentDir = join(tempDir, "agent");
		mkdirSync(agentDir, { recursive: true });
	});

	afterEach(() => {
		if (tempDir && existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
	});

	async function createSession(
		options: ToolOptions = {},
		extensionFactories: InlineExtension[] = [],
		settingsManager = SettingsManager.inMemory(),
	) {
		const resourceLoader = new DefaultResourceLoader({
			cwd: tempDir,
			agentDir,
			settingsManager,
			extensionFactories,
		});
		await resourceLoader.reload();

		return (
			await createAgentSession({
				cwd: tempDir,
				agentDir,
				model: getModel("anthropic", "claude-sonnet-4-5")!,
				settingsManager,
				sessionManager: SessionManager.inMemory(tempDir),
				resourceLoader,
				...options,
			})
		).session;
	}

	it("registers and activates only the native Pi-Codex tool surface", async () => {
		const session = await createSession();

		expect(
			session
				.getAllTools()
				.map((tool) => tool.name)
				.sort(),
		).toEqual([...ALL_CODEX_TOOL_NAMES].sort());
		expect(session.getActiveToolNames()).toEqual(DEFAULT_CODEX_TOOL_NAMES);
		expect(session.systemPrompt).not.toContain("Available tools:");
		session.dispose();
	});

	it("keeps extension and SDK custom tools enabled", async () => {
		const session = await createSession(
			{
				customTools: [
					{
						name: "sdk_tool",
						label: "SDK Tool",
						description: "SDK custom tool",
						parameters: Type.Object({}),
						execute: async () => ({ content: [{ type: "text", text: "ok" }], details: {} }),
					},
				],
			},
			[
				(pi) => {
					pi.registerTool({
						name: "static_tool",
						label: "Static Tool",
						description: "Statically registered extension tool",
						parameters: Type.Object({}),
						execute: async () => ({ content: [{ type: "text", text: "ok" }], details: {} }),
					});
				},
			],
		);
		await session.bindExtensions({});

		expect(session.getActiveToolNames()).toEqual(
			expect.arrayContaining([...DEFAULT_CODEX_TOOL_NAMES, "sdk_tool", "static_tool"]),
		);
		session.dispose();
	});

	it("preserves explicit allowlist and suppression options", async () => {
		const allowlisted = await createSession({ tools: ["exec_command", "apply_patch"] });
		expect(allowlisted.getActiveToolNames()).toEqual(["exec_command", "apply_patch"]);
		allowlisted.dispose();

		const excluded = await createSession({ excludeTools: ["imagegen"] });
		expect(excluded.getActiveToolNames()).toEqual(DEFAULT_CODEX_TOOL_NAMES.filter((name) => name !== "imagegen"));
		excluded.dispose();

		const toolLess = await createSession({ noTools: "all" });
		expect(toolLess.getAllTools()).toEqual([]);
		expect(toolLess.getActiveToolNames()).toEqual([]);
		toolLess.dispose();
	});

	it("applies through service-based session creation", async () => {
		const services = await createAgentSessionServices({ cwd: tempDir, agentDir });
		const { session } = await createAgentSessionFromServices({
			services,
			sessionManager: SessionManager.inMemory(tempDir),
			model: getModel("anthropic", "claude-sonnet-4-5")!,
		});

		expect(session.getActiveToolNames()).toEqual(DEFAULT_CODEX_TOOL_NAMES);
		session.dispose();
	});
});
