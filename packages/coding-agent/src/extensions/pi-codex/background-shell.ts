import { resolveNativePiCodexConfig } from "../../adapter/activation/config.ts";
import { PI_CODEX_CONFIG_CHANGED_CHANNEL } from "../../adapter/activation/config-events.ts";
import { getAgentDir } from "../../config.ts";
import type { ExtensionAPI } from "../../core/extensions/types.ts";
import { SettingsManager } from "../../core/settings-manager.ts";
import type { ExecSessionManager } from "../../tools/exec/session-manager.ts";
import { PI_CODEX_EXEC_SESSIONS_CHANNEL } from "../../tools/runtime.ts";
import {
	BACKGROUND_BASH_WIDGET_ID,
	type BackgroundBashWidgetState,
	registerBackgroundBashWidgetShortcuts,
	renderBackgroundBashWidget,
} from "../../ui/background-bash-widget.ts";

function isExecSessionManager(value: unknown): value is ExecSessionManager {
	return (
		!!value &&
		typeof value === "object" &&
		"listSessions" in value &&
		typeof value.listSessions === "function" &&
		"terminateSession" in value &&
		typeof value.terminateSession === "function" &&
		"onSessionChange" in value &&
		typeof value.onSessionChange === "function"
	);
}

export function registerPiCodexBackgroundShell(pi: ExtensionAPI): void {
	let manager: ExecSessionManager | undefined;
	let removeManagerListener: (() => void) | undefined;
	let renderTimer: ReturnType<typeof setTimeout> | undefined;
	let config = resolveNativePiCodexConfig({ settings: {}, executionMode: "code", notebook: { maxHeapMiB: 4_096 } });
	const state: BackgroundBashWidgetState = { folded: true };
	const controls = {
		listSessions: (maxOutputChars?: number) => manager?.listSessions(maxOutputChars) ?? [],
		terminateSession: (sessionId: number) => manager?.terminateSession(sessionId) ?? false,
	};
	const enabled = () => config.ui.backgroundShellWidget;
	const render = () => {
		if (!state.ctx || !enabled()) return;
		renderBackgroundBashWidget(state.ctx, state, controls);
	};
	const refreshConfig = () => {
		const ctx = state.ctx;
		if (!ctx) return;
		const settings = SettingsManager.create(ctx.cwd, getAgentDir(), { projectTrusted: ctx.isProjectTrusted() });
		config = resolveNativePiCodexConfig({
			settings: settings.getPiCodexSettings(),
			executionMode: settings.getExecutionMode(),
			notebook: settings.getNotebookSettings(),
		});
		if (!enabled()) ctx.ui.setWidget(BACKGROUND_BASH_WIDGET_ID, undefined);
		else render();
	};
	const bindManager = (next: ExecSessionManager) => {
		removeManagerListener?.();
		manager = next;
		removeManagerListener = manager.onSessionChange((reason) => {
			if (reason !== "output") {
				render();
				return;
			}
			if (renderTimer) return;
			renderTimer = setTimeout(() => {
				renderTimer = undefined;
				render();
			}, 250);
		});
	};
	pi.events.on(PI_CODEX_EXEC_SESSIONS_CHANNEL, (value) => {
		if (isExecSessionManager(value)) bindManager(value);
	});
	pi.events.on(PI_CODEX_CONFIG_CHANGED_CHANNEL, refreshConfig);
	registerBackgroundBashWidgetShortcuts(pi, state, controls, config.ui, enabled);
	pi.on("session_start", (_event, ctx) => {
		state.ctx = ctx;
		refreshConfig();
	});
	pi.on("session_shutdown", (_event, ctx) => {
		if (renderTimer) clearTimeout(renderTimer);
		renderTimer = undefined;
		removeManagerListener?.();
		removeManagerListener = undefined;
		manager = undefined;
		state.ctx = undefined;
		ctx.ui.setWidget(BACKGROUND_BASH_WIDGET_ID, undefined);
	});
}
