import { join } from "node:path";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { type CodexConversionConfig, resolveNativePiCodexConfig } from "../../adapter/activation/config.ts";
import { getAgentDir } from "../../config.ts";
import type { ExtensionAPI, ExtensionContext } from "../../core/extensions/types.ts";
import { SettingsManager } from "../../core/settings-manager.ts";
import { parseRealtimeVoicePrompt, REALTIME_VOICE_PROMPT_CHANNEL } from "../../realtime-voice.ts";
import { resolveVoiceHelperBinary } from "../../voice/binary.ts";
import { CodexVoiceController } from "../../voice/controller.ts";
import { CodexLanVoiceServerController } from "../../voice/lan/controller.ts";
import { buildVoiceSetupInstructions } from "../../voice/setup.ts";
import { registerCodexVoiceShortcuts } from "../../voice/shortcuts.ts";
import { type CodexVoiceMode, codexVoiceSetupMessage, registerCodexVoiceRenderer } from "../../voice/ui.ts";

function loadConfig(ctx?: ExtensionContext): CodexConversionConfig {
	const cwd = ctx?.cwd ?? process.cwd();
	const settings = SettingsManager.create(cwd, getAgentDir(), {
		projectTrusted: ctx?.isProjectTrusted() ?? false,
	});
	return resolveNativePiCodexConfig({
		settings: settings.getPiCodexSettings(),
		executionMode: settings.getExecutionMode(),
		notebook: settings.getNotebookSettings(),
	});
}

export function registerPiCodexVoice(pi: ExtensionAPI): void {
	registerCodexVoiceRenderer(pi);
	let config = loadConfig();
	const voice = new CodexVoiceController(pi);
	const lanVoice = new CodexLanVoiceServerController(
		voice,
		() => config,
		(text, ctx) => {
			if (ctx.isIdle()) pi.sendUserMessage(text);
			else pi.sendUserMessage(text, { deliverAs: "steer" });
		},
		getAgentDir(),
	);
	voice.setDelegationPreflight(async () => undefined);

	const start = async (mode: CodexVoiceMode, ctx: ExtensionContext): Promise<void> => {
		config = loadConfig(ctx);
		if (!config.voice.audioSetupCompleted) {
			const settingsPath = join(getAgentDir(), "settings.json");
			pi.sendMessage(
				codexVoiceSetupMessage(
					buildVoiceSetupInstructions({
						config,
						configPath: settingsPath,
						helperPath: resolveVoiceHelperBinary(config.tools.customRustBinariesDir),
						retryCommand: `/voice ${mode}`,
					}),
				),
				{ triggerTurn: true },
			);
			return;
		}
		if (voice.activeMode === mode) return;
		await voice.start(ctx, config, mode);
	};
	const stop = async (_ctx: ExtensionContext): Promise<void> => {
		if (voice.activeMode === "dictation") await voice.finishDictation({ announce: true });
		else await voice.stop({ announce: true });
	};
	const toggle = async (mode: CodexVoiceMode, ctx: ExtensionContext): Promise<void> => {
		if (voice.activeMode === mode) await stop(ctx);
		else await start(mode, ctx);
	};
	const toggleMute = (ctx: ExtensionContext): void => {
		const muted = !voice.inputMuted;
		if (!voice.setInputMuted(muted)) {
			ctx.ui.notify("Start realtime voice before muting the microphone", "info");
			return;
		}
		ctx.ui.notify(`Realtime microphone ${muted ? "muted" : "unmuted"}`, "info");
	};
	const toggleServer = async (ctx: ExtensionContext): Promise<void> => {
		config = loadConfig(ctx);
		const enabled = !lanVoice.status().running;
		await lanVoice.setEnabled(enabled, ctx);
		if (!enabled) ctx.ui.notify("LAN voice server stopped", "info");
	};

	registerCodexVoiceShortcuts(pi, config, () => config, {
		startDictation: (ctx) => start("dictation", ctx),
		finishDictation: stop,
		toggleDictation: (ctx) => toggle("dictation", ctx),
		toggleRealtime: (ctx) => toggle("realtime", ctx),
		toggleInputMute: toggleMute,
		toggleServer,
	});

	pi.registerCommand("voice", {
		description: "Control realtime voice, dictation, and LAN voice",
		getArgumentCompletions: (prefix) =>
			["realtime", "dictation", "mute", "stop", "server", "setup"]
				.filter((value) => value.startsWith(prefix.trim().toLowerCase()))
				.map((value) => ({ label: value, value })),
		handler: async (args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("Voice requires interactive TUI mode", "error");
				return;
			}
			await ctx.waitForIdle();
			const action = args.trim().toLowerCase();
			if (action === "realtime") await toggle("realtime", ctx);
			else if (action === "dictation") await toggle("dictation", ctx);
			else if (action === "mute") toggleMute(ctx);
			else if (action === "stop") await stop(ctx);
			else if (action === "server") await toggleServer(ctx);
			else if (action === "setup") {
				config = loadConfig(ctx);
				pi.sendMessage(
					codexVoiceSetupMessage(
						buildVoiceSetupInstructions({
							config,
							configPath: join(getAgentDir(), "settings.json"),
							helperPath: resolveVoiceHelperBinary(config.tools.customRustBinariesDir),
							retryCommand: "/voice realtime",
						}),
					),
					{ triggerTurn: true },
				);
			} else ctx.ui.notify("Usage: /voice realtime|dictation|mute|stop|server|setup", "warning");
		},
	});

	pi.events.on(REALTIME_VOICE_PROMPT_CHANNEL, (value) => {
		const report = parseRealtimeVoicePrompt(value);
		if (report) voice.setPrompt(report);
	});
	pi.on("session_start", async (_event, ctx) => {
		config = loadConfig(ctx);
		await lanVoice.stop(ctx);
		voice.resetContextAnnouncements();
		voice.resetSessionContext();
	});
	pi.on("model_select", (_event, ctx) => {
		config = loadConfig(ctx);
	});
	pi.on("message_update", (event) => {
		const update = event.assistantMessageEvent;
		if (update.type === "text_delta" && typeof update.delta === "string") voice.streamDelta(update.delta);
	});
	pi.on("message_end", (event) => {
		if (event.message.role !== "assistant") return;
		voice.finishAgentMessage(event.message as AssistantMessage, config.voice.forwardReasoningSummaries);
		lanVoice.assistantMessage(event.message as AssistantMessage);
	});
	pi.on("agent_start", () => {
		voice.agentStarted();
		lanVoice.agentStarted();
	});
	pi.on("agent_settled", () => {
		voice.settleTurn();
		lanVoice.agentSettled();
	});
	pi.on("input", (event) => {
		if (event.streamingBehavior === "steer" && event.source !== "extension") voice.mirrorPiSteer(event.text);
	});
	pi.on("context", (event) => ({ messages: voice.filterContext(event.messages) }));
	pi.on("session_compact", () => voice.resetContextAnnouncements());
	pi.on("session_shutdown", async (_event, ctx) => {
		await lanVoice.stop(ctx);
		await voice.stop({ announce: true });
	});
}
