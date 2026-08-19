import type { SettingItem } from "@earendil-works/pi-tui";

export const SETTINGS_TABS = [
	{
		id: "general",
		label: "General",
		description: "Agent behavior, tool execution, reasoning, and session navigation.",
		settingIds: [
			"execution-mode",
			"thinking",
			"autocompact",
			"steering-mode",
			"follow-up-mode",
			"skill-commands",
			"double-escape-action",
			"tree-filter-mode",
		],
	},
	{
		id: "codex",
		label: "Codex",
		description: "OpenAI request behavior, context compaction, and prompt-cache continuity.",
		settingIds: [
			"codex-fast",
			"codex-verbosity",
			"codex-compaction",
			"codex-compaction-retention",
			"codex-cache-diagnostics",
			"codex-cache-keepalive",
			"codex-cached-websockets",
			"codex-helper-model",
			"codex-image-description",
			"cache-miss-notices",
		],
	},
	{
		id: "voice",
		label: "Voice",
		description: "Realtime voice, dictation, context continuity, and delegated-work speech.",
		settingIds: [
			"codex-voice",
			"codex-voice-resume",
			"codex-dictation-mode",
			"codex-voice-acknowledgements",
			"codex-voice-reasoning",
			"codex-voice-context-model",
			"codex-voice-context-reasoning",
		],
	},
	{
		id: "display",
		label: "Display",
		description: "Transcript content, images, diagrams, status, theme, and spacing.",
		settingIds: [
			"theme",
			"hide-thinking",
			"mermaid-rendering",
			"show-images",
			"image-width-cells",
			"auto-resize-images",
			"block-images",
			"codex-status-line",
			"codex-background-shell",
			"editor-padding",
			"output-padding",
		],
	},
	{
		id: "terminal",
		label: "Terminal",
		description: "Terminal layout, redraw behavior, startup output, and interface ergonomics.",
		settingIds: [
			"tui-mode",
			"fullscreen-exit-output",
			"fullscreen-scrollbar",
			"show-hardware-cursor",
			"autocomplete-max-visible",
			"clear-on-shrink",
			"terminal-progress",
			"quiet-startup",
			"collapse-changelog",
		],
	},
	{
		id: "advanced",
		label: "Advanced",
		description: "Transport, network limits, project trust, telemetry, and warning policy.",
		settingIds: ["transport", "http-idle-timeout", "default-project-trust", "install-telemetry", "warnings"],
	},
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

export function settingsByTab(items: SettingItem[]): Map<SettingsTab["id"], SettingItem[]> {
	const tabsBySettingId = new Map<string, SettingsTab["id"]>();
	for (const tab of SETTINGS_TABS) {
		for (const settingId of tab.settingIds) {
			if (tabsBySettingId.has(settingId)) {
				throw new Error(`Settings entry is assigned to multiple tabs: ${settingId}`);
			}
			tabsBySettingId.set(settingId, tab.id);
		}
	}

	const itemsById = new Map<string, SettingItem>();
	for (const item of items) {
		const tabId = tabsBySettingId.get(item.id);
		if (!tabId) throw new Error(`Settings entry has no tab: ${item.id}`);
		if (itemsById.has(item.id)) throw new Error(`Duplicate settings entry: ${item.id}`);
		itemsById.set(item.id, item);
	}
	return new Map(
		SETTINGS_TABS.map((tab) => [
			tab.id,
			tab.settingIds.flatMap((settingId) => {
				const item = itemsById.get(settingId);
				return item ? [item] : [];
			}),
		]),
	);
}
