import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Transport } from "@earendil-works/pi-ai";
import {
	type Component,
	Container,
	getCapabilities,
	getKeybindings,
	type ScrollViewScrollbar,
	type SelectItem,
	SelectList,
	type SelectListLayoutOptions,
	type SettingItem,
	SettingsList,
	Spacer,
	Text,
	truncateToWidth,
} from "@earendil-works/pi-tui";
import { formatHttpIdleTimeoutMs, HTTP_IDLE_TIMEOUT_CHOICES } from "../../../core/http-dispatcher.ts";
import type {
	DefaultProjectTrust,
	FullscreenExitOutput,
	MermaidRenderingMode,
	PiCodexSettings,
	TuiMode,
	WarningSettings,
} from "../../../core/settings-manager.ts";
import { CODEX_PROFILE_MODEL_IDS } from "../../../product/model-profiles.ts";
import {
	getSelectListTheme,
	getSettingsListTheme,
	parseAutoThemeSetting,
	type TerminalTheme,
	theme,
} from "../theme/theme.ts";
import { DynamicBorder } from "./dynamic-border.ts";
import { keyDisplayText } from "./keybinding-hints.ts";
import { SETTINGS_TABS, type SettingsTabId, settingsByTab } from "./settings-tabs.ts";
import { type CodexUsageActions, CodexUsageTab } from "./usage-tab.ts";

const SETTINGS_SUBMENU_SELECT_LIST_LAYOUT: SelectListLayoutOptions = {
	minPrimaryColumnWidth: 12,
	maxPrimaryColumnWidth: 32,
};

const SETTINGS_BODY_HEIGHT = 12;

const THINKING_DESCRIPTIONS: Record<ThinkingLevel, string> = {
	off: "No reasoning",
	minimal: "Very brief reasoning (~1k tokens)",
	low: "Light reasoning (~2k tokens)",
	medium: "Moderate reasoning (~8k tokens)",
	high: "Deep reasoning (~16k tokens)",
	xhigh: "Extra-high reasoning (~32k tokens)",
	max: "Maximum reasoning",
};

const DEFAULT_PROJECT_TRUST_LABELS: Record<DefaultProjectTrust, string> = {
	ask: "Ask",
	always: "Always trust",
	never: "Never trust",
};

const DEFAULT_PROJECT_TRUST_BY_LABEL = new Map(
	Object.entries(DEFAULT_PROJECT_TRUST_LABELS).map(([value, label]) => [label, value as DefaultProjectTrust]),
);

const TOGGLE_VALUES = ["off", "on"];

function toggleValue(enabled: boolean): string {
	return enabled ? "on" : "off";
}

function isEnabled(value: string): boolean {
	return value === "on";
}

export interface SettingsConfig {
	autoCompact: boolean;
	showImages: boolean;
	imageWidthCells: number;
	autoResizeImages: boolean;
	blockImages: boolean;
	enableSkillCommands: boolean;
	steeringMode: "all" | "one-at-a-time";
	followUpMode: "all" | "one-at-a-time";
	transport: Transport;
	executionMode: "code" | "notebook";
	piCodex: PiCodexSettings;
	httpIdleTimeoutMs: number;
	thinkingLevel: ThinkingLevel;
	availableThinkingLevels: ThinkingLevel[];
	currentTheme: string;
	terminalTheme: TerminalTheme;
	availableThemes: string[];
	hideThinkingBlock: boolean;
	mermaidRenderingMode: MermaidRenderingMode;
	showCacheMissNotices: boolean;
	collapseChangelog: boolean;
	enableInstallTelemetry: boolean;
	doubleEscapeAction: "fork" | "tree" | "none";
	treeFilterMode: "default" | "no-tools" | "user-only" | "labeled-only" | "all";
	showHardwareCursor: boolean;
	editorPaddingX: number;
	outputPad: 0 | 1;
	autocompleteMaxVisible: number;
	quietStartup: boolean;
	defaultProjectTrust: DefaultProjectTrust;
	clearOnShrink: boolean;
	showTerminalProgress: boolean;
	tuiMode: TuiMode;
	fullscreenExitOutput: FullscreenExitOutput;
	fullscreenScrollbar: ScrollViewScrollbar;
	warnings: WarningSettings;
}

export interface SettingsCallbacks {
	onAutoCompactChange: (enabled: boolean) => void;
	onShowImagesChange: (enabled: boolean) => void;
	onImageWidthCellsChange: (width: number) => void;
	onAutoResizeImagesChange: (enabled: boolean) => void;
	onBlockImagesChange: (blocked: boolean) => void;
	onEnableSkillCommandsChange: (enabled: boolean) => void;
	onSteeringModeChange: (mode: "all" | "one-at-a-time") => void;
	onFollowUpModeChange: (mode: "all" | "one-at-a-time") => void;
	onTransportChange: (transport: Transport) => void;
	onExecutionModeChange: (mode: "code" | "notebook") => void;
	onPiCodexChange: (settings: PiCodexSettings) => void;
	onHttpIdleTimeoutMsChange: (timeoutMs: number) => void;
	onThinkingLevelChange: (level: ThinkingLevel) => void;
	onThemeChange: (theme: string) => void;
	onThemePreview?: (theme: string) => void;
	onHideThinkingBlockChange: (hidden: boolean) => void;
	onMermaidRenderingModeChange: (mode: MermaidRenderingMode) => void;
	onShowCacheMissNoticesChange: (shown: boolean) => void;
	onCollapseChangelogChange: (collapsed: boolean) => void;
	onEnableInstallTelemetryChange: (enabled: boolean) => void;
	onDoubleEscapeActionChange: (action: "fork" | "tree" | "none") => void;
	onTreeFilterModeChange: (mode: "default" | "no-tools" | "user-only" | "labeled-only" | "all") => void;
	onShowHardwareCursorChange: (enabled: boolean) => void;
	onEditorPaddingXChange: (padding: number) => void;
	onOutputPadChange: (padding: 0 | 1) => void;
	onAutocompleteMaxVisibleChange: (maxVisible: number) => void;
	onQuietStartupChange: (enabled: boolean) => void;
	onDefaultProjectTrustChange: (defaultProjectTrust: DefaultProjectTrust) => void;
	onClearOnShrinkChange: (enabled: boolean) => void;
	onShowTerminalProgressChange: (enabled: boolean) => void;
	onTuiModeChange: (mode: TuiMode) => void;
	onFullscreenExitOutputChange: (output: FullscreenExitOutput) => void;
	onFullscreenScrollbarChange: (mode: ScrollViewScrollbar) => void;
	onWarningsChange: (warnings: WarningSettings) => void;
	onCancel: () => void;
}

export interface SettingsSelectorOptions {
	initialTab?: SettingsTabId | undefined;
	usage?: CodexUsageActions | undefined;
	requestRender?: (() => void) | undefined;
}

/**
 * A submenu component for selecting from a list of options.
 */
class WarningSettingsSubmenu extends Container {
	private settingsList: SettingsList;
	private state: WarningSettings;

	constructor(warnings: WarningSettings, onChange: (warnings: WarningSettings) => void, onCancel: () => void) {
		super();

		this.state = { ...warnings };

		const items: SettingItem[] = [
			{
				id: "anthropic-extra-usage",
				label: "Anthropic extra usage",
				description: "Warn when Anthropic subscription auth may use paid extra usage",
				currentValue: toggleValue(this.state.anthropicExtraUsage ?? true),
				values: TOGGLE_VALUES,
			},
		];

		this.settingsList = new SettingsList(
			items,
			Math.min(items.length, 10),
			getSettingsListTheme(),
			(id, newValue) => {
				switch (id) {
					case "anthropic-extra-usage":
						this.state = { ...this.state, anthropicExtraUsage: isEnabled(newValue) };
						onChange({ ...this.state });
						break;
				}
			},
			onCancel,
		);

		this.addChild(this.settingsList);
	}

	handleInput(data: string): void {
		this.settingsList.handleInput(data);
	}
}

class SelectSubmenu extends Container {
	private selectList: SelectList;

	constructor(
		title: string,
		description: string,
		options: SelectItem[],
		currentValue: string,
		onSelect: (value: string) => void,
		onCancel: () => void,
		onSelectionChange?: (value: string) => void,
	) {
		super();

		// Title
		this.addChild(new Text(theme.bold(theme.fg("accent", title)), 0, 0));

		// Description
		if (description) {
			this.addChild(new Spacer(1));
			this.addChild(new Text(theme.fg("muted", description), 0, 0));
		}

		// Spacer
		this.addChild(new Spacer(1));

		// Select list
		this.selectList = new SelectList(
			options,
			Math.min(options.length, 10),
			getSelectListTheme(),
			SETTINGS_SUBMENU_SELECT_LIST_LAYOUT,
		);

		// Pre-select current value
		const currentIndex = options.findIndex((o) => o.value === currentValue);
		if (currentIndex !== -1) {
			this.selectList.setSelectedIndex(currentIndex);
		}

		this.selectList.onSelect = (item) => {
			onSelect(item.value);
		};

		this.selectList.onCancel = onCancel;

		if (onSelectionChange) {
			this.selectList.onSelectionChange = (item) => {
				onSelectionChange(item.value);
			};
		}

		this.addChild(this.selectList);

		// Hint
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("dim", "  Enter to select · Esc to go back"), 0, 0));
	}

	handleInput(data: string): void {
		this.selectList.handleInput(data);
	}
}

function themeItems(availableThemes: string[]): SelectItem[] {
	return availableThemes.map((name) => ({ value: name, label: name }));
}

const AUTOMATIC_THEME_VALUE = "/";

function singleModeThemeItems(availableThemes: string[]): SelectItem[] {
	return [
		{
			value: AUTOMATIC_THEME_VALUE,
			label: "Automatic",
			description: "Use separate themes for light and dark terminal appearance",
		},
		...themeItems(availableThemes),
	];
}

function preferredTheme(availableThemes: string[], preferred: string | undefined, fallback: string): string {
	if (preferred && availableThemes.includes(preferred)) return preferred;
	if (availableThemes.includes(fallback)) return fallback;
	return availableThemes[0] ?? fallback;
}

function defaultAutomaticThemes(
	currentThemeSetting: string,
	availableThemes: string[],
): { lightTheme: string; darkTheme: string } {
	const autoTheme = parseAutoThemeSetting(currentThemeSetting);
	if (autoTheme) return autoTheme;

	const currentFixedTheme = currentThemeSetting.includes("/") ? undefined : currentThemeSetting;
	const themeName = preferredTheme(availableThemes, currentFixedTheme, "dark");
	return { lightTheme: themeName, darkTheme: themeName };
}

class ThemeSubmenu extends Container {
	private inputComponent: Component | undefined;
	private readonly callbacks: SettingsCallbacks;
	private readonly availableThemes: string[];
	private readonly terminalTheme: TerminalTheme;
	private readonly onDone: (selectedValue?: string) => void;
	private readonly originalThemeSetting: string;
	private mode: "single" | "automatic";
	private singleTheme: string;
	private lightTheme: string;
	private darkTheme: string;

	constructor(
		currentThemeSetting: string,
		terminalTheme: TerminalTheme,
		availableThemes: string[],
		callbacks: SettingsCallbacks,
		onDone: (selectedValue?: string) => void,
	) {
		super();
		this.callbacks = callbacks;
		this.availableThemes = availableThemes;
		this.terminalTheme = terminalTheme;
		this.onDone = onDone;
		this.originalThemeSetting = currentThemeSetting;
		const autoTheme = parseAutoThemeSetting(currentThemeSetting);
		const automaticThemes = defaultAutomaticThemes(currentThemeSetting, availableThemes);
		const fixedTheme = autoTheme || currentThemeSetting.includes("/") ? undefined : currentThemeSetting;
		this.mode = autoTheme ? "automatic" : "single";
		this.lightTheme = automaticThemes.lightTheme;
		this.darkTheme = automaticThemes.darkTheme;
		this.singleTheme = preferredTheme(
			availableThemes,
			fixedTheme ?? (autoTheme ? this.getActiveAutomaticTheme() : undefined),
			"dark",
		);

		if (this.mode === "automatic") {
			this.showAutomaticMenu();
		} else {
			this.showSingleMenu();
		}
	}

	handleInput(data: string): void {
		this.inputComponent?.handleInput?.(data);
	}

	private setContent(renderComponent: Component, inputComponent: Component = renderComponent): void {
		this.clear();
		this.addChild(renderComponent);
		this.inputComponent = inputComponent;
	}

	private showSingleMenu(): void {
		this.mode = "single";
		const menu = new SelectSubmenu(
			"Theme",
			"Select a theme, or choose Automatic to follow terminal appearance.",
			singleModeThemeItems(this.availableThemes),
			this.singleTheme,
			(value) => {
				if (value === AUTOMATIC_THEME_VALUE) {
					this.mode = "automatic";
					this.callbacks.onThemePreview?.(this.getThemeSetting());
					this.showAutomaticMenu();
					return;
				}

				this.singleTheme = value;
				this.apply(value);
			},
			() => this.cancel(),
			(value) => {
				this.callbacks.onThemePreview?.(value === AUTOMATIC_THEME_VALUE ? this.getAutomaticThemeSetting() : value);
			},
		);
		this.setContent(menu);
	}

	private showAutomaticMenu(): void {
		this.mode = "automatic";
		const content = new Container();
		content.addChild(new Text(theme.bold(theme.fg("accent", "Automatic Theme")), 0, 0));
		content.addChild(new Spacer(1));
		content.addChild(new Text(theme.fg("muted", "Choose themes for terminal light and dark appearance."), 0, 0));
		content.addChild(new Text(theme.fg("muted", "Light/dark detection requires terminal support."), 0, 0));
		content.addChild(new Spacer(1));

		const items: SettingItem[] = [
			{
				id: "light-theme",
				label: "Light theme",
				description: "Theme to use in automatic mode when the terminal is light",
				currentValue: this.lightTheme,
				submenu: (currentValue, done) =>
					this.createThemeSelect(
						"Light Theme",
						"Select the theme to use for light terminal appearance",
						currentValue,
						done,
						(value) => {
							this.lightTheme = value;
							this.callbacks.onThemePreview?.(this.getThemeSetting());
							done(value);
						},
					),
			},
			{
				id: "dark-theme",
				label: "Dark theme",
				description: "Theme to use in automatic mode when the terminal is dark",
				currentValue: this.darkTheme,
				submenu: (currentValue, done) =>
					this.createThemeSelect(
						"Dark Theme",
						"Select the theme to use for dark terminal appearance",
						currentValue,
						done,
						(value) => {
							this.darkTheme = value;
							this.callbacks.onThemePreview?.(this.getThemeSetting());
							done(value);
						},
					),
			},
			{
				id: "apply",
				label: "Apply",
				description: "Save and go back",
				currentValue: "save and go back",
				values: ["save and go back"],
			},
			{
				id: "single-mode",
				label: "Change mode",
				description: "Switch to one theme for light and dark",
				currentValue: "switch to single theme",
				values: ["switch to single theme"],
			},
		];

		const settingsList = new SettingsList(
			items,
			Math.min(items.length, 10),
			getSettingsListTheme(),
			(id) => {
				switch (id) {
					case "single-mode":
						this.mode = "single";
						this.singleTheme = this.getActiveAutomaticTheme();
						this.callbacks.onThemePreview?.(this.singleTheme);
						this.showSingleMenu();
						break;
					case "apply":
						this.apply(this.getAutomaticThemeSetting());
						break;
				}
			},
			() => this.cancel(),
		);
		content.addChild(settingsList);
		this.setContent(content, settingsList);
	}

	private createThemeSelect(
		title: string,
		description: string,
		currentValue: string,
		done: (selectedValue?: string) => void,
		onSelect: (value: string) => void,
	): SelectSubmenu {
		return new SelectSubmenu(
			title,
			description,
			themeItems(this.availableThemes),
			currentValue,
			onSelect,
			() => {
				this.callbacks.onThemePreview?.(this.getThemeSetting());
				done();
			},
			(value) => this.callbacks.onThemePreview?.(value),
		);
	}

	private getThemeSetting(): string {
		return this.mode === "automatic" ? this.getAutomaticThemeSetting() : this.singleTheme;
	}

	private getActiveAutomaticTheme(): string {
		return this.terminalTheme === "light" ? this.lightTheme : this.darkTheme;
	}

	private getAutomaticThemeSetting(): string {
		return `${this.lightTheme}/${this.darkTheme}`;
	}

	private apply(themeSetting: string): void {
		this.onDone(themeSetting);
	}

	private cancel(): void {
		this.callbacks.onThemePreview?.(this.originalThemeSetting);
		this.onDone();
	}
}

/**
 * Main settings selector component.
 */
export class SettingsSelectorComponent extends Container {
	private settingsList: SettingsList;
	private readonly itemsByTab: Map<(typeof SETTINGS_TABS)[number]["id"], SettingItem[]>;
	private readonly onSettingChange: (id: string, newValue: string) => void;
	private readonly onCancel: () => void;
	private readonly border = new DynamicBorder();
	private readonly usageTab: CodexUsageTab | undefined;
	private activeTabIndex = 0;

	constructor(config: SettingsConfig, callbacks: SettingsCallbacks, options: SettingsSelectorOptions = {}) {
		super();
		if (options.initialTab) {
			const initialTabIndex = SETTINGS_TABS.findIndex((tab) => tab.id === options.initialTab);
			if (initialTabIndex >= 0) this.activeTabIndex = initialTabIndex;
		}

		const supportsImages = getCapabilities().images;
		const followUpKey = keyDisplayText("app.message.followUp");
		let currentWarnings = { ...config.warnings };
		let currentPiCodex = structuredClone(config.piCodex ?? {});
		const realtimeShortcut = currentPiCodex.voice?.realtimeShortcut ?? "ctrl+alt+space";
		const dictationShortcut = currentPiCodex.voice?.dictationShortcut ?? "ctrl+alt+d";
		const muteShortcut = currentPiCodex.voice?.muteShortcut ?? "ctrl+alt+m";
		const serverShortcut = currentPiCodex.voice?.serverShortcut ?? "ctrl+alt+g";

		const items: SettingItem[] = [
			{
				id: "autocompact",
				label: "Auto-compact",
				description: "Automatically compact context when it gets too large",
				currentValue: toggleValue(config.autoCompact),
				values: TOGGLE_VALUES,
			},
			{
				id: "steering-mode",
				label: "Steering mode",
				description:
					"Enter while streaming queues steering messages. 'one-at-a-time': deliver one, wait for response. 'all': deliver all at once.",
				currentValue: config.steeringMode,
				values: ["one-at-a-time", "all"],
			},
			{
				id: "follow-up-mode",
				label: "Follow-up mode",
				description: `${followUpKey} queues follow-up messages until agent stops. 'one-at-a-time': deliver one, wait for response. 'all': deliver all at once.`,
				currentValue: config.followUpMode,
				values: ["one-at-a-time", "all"],
			},
			{
				id: "execution-mode",
				label: "Execution mode",
				description: "Notebook keeps a persistent Deno/TypeScript kernel; Code runs each cell independently in V8",
				currentValue: config.executionMode,
				values: ["notebook", "code"],
			},
			{
				id: "codex-fast",
				label: "Fast mode",
				description: "Use OpenAI priority service tier",
				currentValue: toggleValue(currentPiCodex.openai?.fast ?? false),
				values: TOGGLE_VALUES,
			},
			{
				id: "codex-verbosity",
				label: "Verbosity",
				description: "Response text verbosity sent to OpenAI",
				currentValue: currentPiCodex.openai?.verbosity ?? "low",
				values: ["low", "medium", "high"],
			},
			{
				id: "codex-compaction",
				label: "Compaction V2",
				description: "Use encrypted native Responses compaction and replay",
				currentValue: toggleValue(currentPiCodex.compaction?.responsesCompaction ?? true),
				values: TOGGLE_VALUES,
			},
			{
				id: "codex-cache-diagnostics",
				label: "Cache diagnostics",
				description: "Show transport/cache status; logging stores safe metadata only",
				currentValue: currentPiCodex.openai?.cacheDiagnostics ?? "off",
				values: ["off", "status", "status-and-log"],
			},
			{
				id: "codex-cache-keepalive",
				label: "Cache keepalive",
				description: "Refresh an idle cached WebSocket context every 25 minutes",
				currentValue: toggleValue(currentPiCodex.openai?.cacheKeepalive ?? false),
				values: TOGGLE_VALUES,
			},
			{
				id: "codex-cached-websockets",
				label: "Cached WebSockets",
				description: "Keep session transport and continuation state warm",
				currentValue: toggleValue(currentPiCodex.openai?.forceCachedWebSockets ?? true),
				values: TOGGLE_VALUES,
			},
			{
				id: "codex-compaction-retention",
				label: "User-message retention",
				description: "Approximate recent user-message window retained around encrypted checkpoints",
				currentValue: String(currentPiCodex.compaction?.v2UserMessageRetention ?? 64),
				values: ["16", "32", "64"],
			},
			{
				id: "codex-helper-model",
				label: "Helper model",
				description: "Model used by web search and text image descriptions",
				currentValue: currentPiCodex.openai?.webSearchModel ?? "gpt-5.6-luna",
				values: [...CODEX_PROFILE_MODEL_IDS],
			},
			{
				id: "codex-image-description",
				label: "Text image descriptions",
				description: "Use the Codex helper model to return plain-text image descriptions",
				currentValue: toggleValue(currentPiCodex.viewImageFallback ?? false),
				values: TOGGLE_VALUES,
			},
			{
				id: "codex-status-line",
				label: "Status line",
				description: "Show execution mode, native tools, cache state, and subscription usage above the editor",
				currentValue: toggleValue(currentPiCodex.ui?.statusLine ?? true),
				values: TOGGLE_VALUES,
			},
			{
				id: "codex-background-shell",
				label: "Background shell widget",
				description: "Show resumable background command status above the editor",
				currentValue: toggleValue(currentPiCodex.ui?.backgroundShellWidget ?? true),
				values: TOGGLE_VALUES,
			},
			{
				id: "codex-voice",
				label: "Realtime voice",
				description: `Choose the realtime voice. ${realtimeShortcut} starts or stops it, ${muteShortcut} mutes it, and ${serverShortcut} toggles LAN control. Use /voice setup to diagnose audio.`,
				currentValue: currentPiCodex.voice?.v3Voice ?? "cove",
				values: ["cove", "juniper", "maple", "spruce", "ember", "vale", "breeze", "arbor", "sol"],
			},
			{
				id: "codex-voice-resume",
				label: "Auto-resume calls",
				description: "Reconnect only calls that were previously established",
				currentValue: toggleValue(currentPiCodex.voice?.autoResumeRealtime ?? false),
				values: TOGGLE_VALUES,
			},
			{
				id: "codex-dictation-mode",
				label: "Dictation behavior",
				description: `${dictationShortcut}: Push records while held; toggle starts and stops on each press`,
				currentValue: currentPiCodex.voice?.dictationShortcutMode ?? "push",
				values: ["push", "toggle"],
			},
			{
				id: "codex-voice-acknowledgements",
				label: "Delegation acknowledgement",
				description: "Let realtime voice acknowledge delegated work while Pi runs",
				currentValue: toggleValue(currentPiCodex.voice?.delegationAcknowledgements ?? true),
				values: TOGGLE_VALUES,
			},
			{
				id: "codex-voice-reasoning",
				label: "Reasoning summaries",
				description: "Use a completed reasoning summary when tool work produced no speakable text",
				currentValue: toggleValue(currentPiCodex.voice?.forwardReasoningSummaries ?? true),
				values: TOGGLE_VALUES,
			},
			{
				id: "codex-voice-context-model",
				label: "Context model",
				description:
					"Optional isolated model that maintains a compact continuity summary for realtime voice without adding voice chatter to the coding turn",
				currentValue: currentPiCodex.voice?.contextModel?.modelId ?? "off",
				values: ["off", ...CODEX_PROFILE_MODEL_IDS],
			},
			{
				id: "codex-voice-context-reasoning",
				label: "Context reasoning",
				description: "Reasoning level for the isolated voice continuity summary",
				currentValue: currentPiCodex.voice?.contextReasoning ?? "high",
				values: ["off", "minimal", "low", "medium", "high", "xhigh", "max"],
			},
			{
				id: "transport",
				label: "Transport",
				description: "Preferred transport for providers that support multiple transports",
				currentValue: config.transport,
				values: ["sse", "websocket", "websocket-cached", "auto"],
			},
			{
				id: "http-idle-timeout",
				label: "HTTP idle timeout",
				description:
					"Maximum idle gap while waiting for HTTP headers or body chunks. Disable for local models that pause longer than five minutes.",
				currentValue: formatHttpIdleTimeoutMs(config.httpIdleTimeoutMs),
				values: HTTP_IDLE_TIMEOUT_CHOICES.map((choice) => choice.label),
			},
			{
				id: "hide-thinking",
				label: "Hide thinking",
				description: "Hide thinking blocks in assistant responses",
				currentValue: toggleValue(config.hideThinkingBlock),
				values: TOGGLE_VALUES,
			},
			{
				id: "mermaid-rendering",
				label: "Mermaid diagrams",
				description: "Render Mermaid code blocks as Unicode diagrams",
				currentValue: config.mermaidRenderingMode,
				values: ["off", "final", "streaming"],
			},
			{
				id: "cache-miss-notices",
				label: "Cache miss notices",
				description: "Show transcript notices for significant prompt-cache misses and compaction costs",
				currentValue: toggleValue(config.showCacheMissNotices),
				values: TOGGLE_VALUES,
			},
			{
				id: "collapse-changelog",
				label: "Collapse changelog",
				description: "Show condensed changelog after updates",
				currentValue: toggleValue(config.collapseChangelog),
				values: TOGGLE_VALUES,
			},
			{
				id: "quiet-startup",
				label: "Quiet startup",
				description: "Disable verbose printing at startup",
				currentValue: toggleValue(config.quietStartup),
				values: TOGGLE_VALUES,
			},
			{
				id: "install-telemetry",
				label: "Install telemetry",
				description: "Send an anonymous version/update ping after changelog-detected updates",
				currentValue: toggleValue(config.enableInstallTelemetry),
				values: TOGGLE_VALUES,
			},
			{
				id: "default-project-trust",
				label: "Default project trust",
				description: "Fallback behavior when no extension or saved trust decision decides project trust",
				currentValue: DEFAULT_PROJECT_TRUST_LABELS[config.defaultProjectTrust],
				values: Object.values(DEFAULT_PROJECT_TRUST_LABELS),
			},
			{
				id: "double-escape-action",
				label: "Double-escape action",
				description: "Action when pressing Escape twice with empty editor",
				currentValue: config.doubleEscapeAction,
				values: ["tree", "fork", "none"],
			},
			{
				id: "tree-filter-mode",
				label: "Tree filter mode",
				description: "Default filter when opening /tree",
				currentValue: config.treeFilterMode,
				values: ["default", "no-tools", "user-only", "labeled-only", "all"],
			},
			{
				id: "warnings",
				label: "Warnings",
				description: "Enable or disable individual warnings",
				currentValue: "configure",
				submenu: (_currentValue, done) =>
					new WarningSettingsSubmenu(
						currentWarnings,
						(warnings) => {
							currentWarnings = warnings;
							callbacks.onWarningsChange(warnings);
						},
						() => done(),
					),
			},
			{
				id: "thinking",
				label: "Thinking level",
				description: "Reasoning depth for thinking-capable models",
				currentValue: config.thinkingLevel,
				submenu: (currentValue, done) =>
					new SelectSubmenu(
						"Thinking Level",
						"Select reasoning depth for thinking-capable models",
						config.availableThinkingLevels.map((level) => ({
							value: level,
							label: level,
							description: THINKING_DESCRIPTIONS[level],
						})),
						currentValue,
						(value) => {
							callbacks.onThinkingLevelChange(value as ThinkingLevel);
							done(value);
						},
						() => done(),
					),
			},
			{
				id: "tui-mode",
				label: "TUI mode",
				description: "Interface layout; fullscreen mode is experimental",
				currentValue: config.tuiMode,
				values: ["regular", "fullscreen"],
			},
			{
				id: "fullscreen-exit-output",
				label: "Fullscreen exit output",
				description: "Print the transcript or only a session resume hint when exiting fullscreen mode",
				currentValue: config.fullscreenExitOutput,
				values: ["transcript", "resume-hint"],
			},
			{
				id: "fullscreen-scrollbar",
				label: "Fullscreen scrollbar",
				description: "Scrollbar behavior in fullscreen mode; has no effect in regular mode",
				currentValue: config.fullscreenScrollbar,
				values: ["auto", "always", "hidden"],
			},
			{
				id: "theme",
				label: "Theme",
				description: "Color theme for the interface",
				currentValue: config.currentTheme,
				submenu: (currentValue, done) =>
					new ThemeSubmenu(currentValue, config.terminalTheme, config.availableThemes, callbacks, done),
			},
		];

		// Only show image toggle if terminal supports it
		if (supportsImages) {
			// Insert after autocompact
			items.splice(1, 0, {
				id: "show-images",
				label: "Show images",
				description: "Render images inline in terminal",
				currentValue: toggleValue(config.showImages),
				values: TOGGLE_VALUES,
			});
			items.splice(2, 0, {
				id: "image-width-cells",
				label: "Image width",
				description: "Preferred inline image width in terminal cells",
				currentValue: String(config.imageWidthCells),
				values: ["60", "80", "120"],
			});
		}

		// Image auto-resize toggle (always available, affects both attached and read images)
		items.splice(supportsImages ? 3 : 1, 0, {
			id: "auto-resize-images",
			label: "Auto-resize images",
			description: "Resize large images to 2000x2000 max for better model compatibility",
			currentValue: toggleValue(config.autoResizeImages),
			values: TOGGLE_VALUES,
		});

		// Block images toggle (always available, insert after auto-resize-images)
		const autoResizeIndex = items.findIndex((item) => item.id === "auto-resize-images");
		items.splice(autoResizeIndex + 1, 0, {
			id: "block-images",
			label: "Block images",
			description: "Prevent images from being sent to LLM providers",
			currentValue: toggleValue(config.blockImages),
			values: TOGGLE_VALUES,
		});

		// Skill commands toggle (insert after block-images)
		const blockImagesIndex = items.findIndex((item) => item.id === "block-images");
		items.splice(blockImagesIndex + 1, 0, {
			id: "skill-commands",
			label: "Skill commands",
			description: "Register skills as /skill:name commands",
			currentValue: toggleValue(config.enableSkillCommands),
			values: TOGGLE_VALUES,
		});

		// Hardware cursor toggle (insert after skill-commands)
		const skillCommandsIndex = items.findIndex((item) => item.id === "skill-commands");
		items.splice(skillCommandsIndex + 1, 0, {
			id: "show-hardware-cursor",
			label: "Show hardware cursor",
			description: "Show the terminal cursor while still positioning it for IME support",
			currentValue: toggleValue(config.showHardwareCursor),
			values: TOGGLE_VALUES,
		});

		// Editor padding toggle (insert after show-hardware-cursor)
		const hardwareCursorIndex = items.findIndex((item) => item.id === "show-hardware-cursor");
		items.splice(hardwareCursorIndex + 1, 0, {
			id: "editor-padding",
			label: "Editor padding",
			description: "Horizontal padding for input editor (0-3)",
			currentValue: String(config.editorPaddingX),
			values: ["0", "1", "2", "3"],
		});

		// Output padding toggle (insert after editor-padding)
		const editorPaddingIndex = items.findIndex((item) => item.id === "editor-padding");
		items.splice(editorPaddingIndex + 1, 0, {
			id: "output-padding",
			label: "Output padding",
			description: "Horizontal padding for user messages, assistant messages, and thinking",
			currentValue: String(config.outputPad),
			values: ["0", "1"],
		});

		// Autocomplete max visible toggle (insert after output-padding)
		const outputPaddingIndex = items.findIndex((item) => item.id === "output-padding");
		items.splice(outputPaddingIndex + 1, 0, {
			id: "autocomplete-max-visible",
			label: "Autocomplete max items",
			description: "Max visible items in autocomplete dropdown (3-20)",
			currentValue: String(config.autocompleteMaxVisible),
			values: ["3", "5", "7", "10", "15", "20"],
		});

		// Clear on shrink toggle (insert after autocomplete-max-visible)
		const autocompleteIndex = items.findIndex((item) => item.id === "autocomplete-max-visible");
		items.splice(autocompleteIndex + 1, 0, {
			id: "clear-on-shrink",
			label: "Clear on shrink",
			description: "Clear empty rows when content shrinks (may cause flicker)",
			currentValue: toggleValue(config.clearOnShrink),
			values: TOGGLE_VALUES,
		});

		// Terminal progress toggle (insert after clear-on-shrink)
		const clearOnShrinkIndex = items.findIndex((item) => item.id === "clear-on-shrink");
		items.splice(clearOnShrinkIndex + 1, 0, {
			id: "terminal-progress",
			label: "Terminal progress",
			description: "Show OSC 9;4 progress indicators in the terminal tab bar",
			currentValue: toggleValue(config.showTerminalProgress),
			values: TOGGLE_VALUES,
		});

		this.itemsByTab = settingsByTab(items);
		this.onCancel = callbacks.onCancel;
		this.onSettingChange = (id, newValue) => {
			switch (id) {
				case "autocompact":
					callbacks.onAutoCompactChange(isEnabled(newValue));
					break;
				case "show-images":
					callbacks.onShowImagesChange(isEnabled(newValue));
					break;
				case "image-width-cells":
					callbacks.onImageWidthCellsChange(parseInt(newValue, 10));
					break;
				case "auto-resize-images":
					callbacks.onAutoResizeImagesChange(isEnabled(newValue));
					break;
				case "block-images":
					callbacks.onBlockImagesChange(isEnabled(newValue));
					break;
				case "skill-commands":
					callbacks.onEnableSkillCommandsChange(isEnabled(newValue));
					break;
				case "steering-mode":
					callbacks.onSteeringModeChange(newValue as "all" | "one-at-a-time");
					break;
				case "follow-up-mode":
					callbacks.onFollowUpModeChange(newValue as "all" | "one-at-a-time");
					break;
				case "transport":
					callbacks.onTransportChange(newValue as Transport);
					break;
				case "execution-mode":
					callbacks.onExecutionModeChange(newValue as "code" | "notebook");
					break;
				case "codex-fast":
					currentPiCodex = {
						...currentPiCodex,
						openai: { ...currentPiCodex.openai, fast: isEnabled(newValue) },
					};
					callbacks.onPiCodexChange(currentPiCodex);
					break;
				case "codex-verbosity":
					currentPiCodex = {
						...currentPiCodex,
						openai: { ...currentPiCodex.openai, verbosity: newValue as "low" | "medium" | "high" },
					};
					callbacks.onPiCodexChange(currentPiCodex);
					break;
				case "codex-compaction":
					currentPiCodex = {
						...currentPiCodex,
						compaction: { ...currentPiCodex.compaction, responsesCompaction: isEnabled(newValue) },
					};
					callbacks.onPiCodexChange(currentPiCodex);
					break;
				case "codex-cache-diagnostics":
					currentPiCodex = {
						...currentPiCodex,
						openai: {
							...currentPiCodex.openai,
							cacheDiagnostics: newValue as "off" | "status" | "status-and-log",
						},
					};
					callbacks.onPiCodexChange(currentPiCodex);
					break;
				case "codex-cache-keepalive":
					currentPiCodex = {
						...currentPiCodex,
						openai: { ...currentPiCodex.openai, cacheKeepalive: isEnabled(newValue) },
					};
					callbacks.onPiCodexChange(currentPiCodex);
					break;
				case "codex-cached-websockets":
					currentPiCodex = {
						...currentPiCodex,
						openai: { ...currentPiCodex.openai, forceCachedWebSockets: isEnabled(newValue) },
					};
					callbacks.onPiCodexChange(currentPiCodex);
					break;
				case "codex-compaction-retention":
					currentPiCodex = {
						...currentPiCodex,
						compaction: {
							...currentPiCodex.compaction,
							v2UserMessageRetention: Number(newValue) as 16 | 32 | 64,
						},
					};
					callbacks.onPiCodexChange(currentPiCodex);
					break;
				case "codex-helper-model":
					currentPiCodex = {
						...currentPiCodex,
						openai: { ...currentPiCodex.openai, webSearchModel: newValue },
					};
					callbacks.onPiCodexChange(currentPiCodex);
					break;
				case "codex-image-description":
					currentPiCodex = { ...currentPiCodex, viewImageFallback: isEnabled(newValue) };
					callbacks.onPiCodexChange(currentPiCodex);
					break;
				case "codex-status-line":
					currentPiCodex = {
						...currentPiCodex,
						ui: { ...currentPiCodex.ui, statusLine: isEnabled(newValue) },
					};
					callbacks.onPiCodexChange(currentPiCodex);
					break;
				case "codex-background-shell":
					currentPiCodex = {
						...currentPiCodex,
						ui: { ...currentPiCodex.ui, backgroundShellWidget: isEnabled(newValue) },
					};
					callbacks.onPiCodexChange(currentPiCodex);
					break;
				case "codex-voice":
					currentPiCodex = { ...currentPiCodex, voice: { ...currentPiCodex.voice, v3Voice: newValue } };
					callbacks.onPiCodexChange(currentPiCodex);
					break;
				case "codex-voice-resume":
					currentPiCodex = {
						...currentPiCodex,
						voice: { ...currentPiCodex.voice, autoResumeRealtime: isEnabled(newValue) },
					};
					callbacks.onPiCodexChange(currentPiCodex);
					break;
				case "codex-dictation-mode":
					currentPiCodex = {
						...currentPiCodex,
						voice: { ...currentPiCodex.voice, dictationShortcutMode: newValue as "push" | "toggle" },
					};
					callbacks.onPiCodexChange(currentPiCodex);
					break;
				case "codex-voice-acknowledgements":
					currentPiCodex = {
						...currentPiCodex,
						voice: { ...currentPiCodex.voice, delegationAcknowledgements: isEnabled(newValue) },
					};
					callbacks.onPiCodexChange(currentPiCodex);
					break;
				case "codex-voice-reasoning":
					currentPiCodex = {
						...currentPiCodex,
						voice: { ...currentPiCodex.voice, forwardReasoningSummaries: isEnabled(newValue) },
					};
					callbacks.onPiCodexChange(currentPiCodex);
					break;
				case "codex-voice-context-model": {
					const { contextModel: _contextModel, ...voice } = currentPiCodex.voice ?? {};
					currentPiCodex = {
						...currentPiCodex,
						voice:
							newValue === "off"
								? voice
								: { ...voice, contextModel: { provider: "openai-codex", modelId: newValue } },
					};
					callbacks.onPiCodexChange(currentPiCodex);
					break;
				}
				case "codex-voice-context-reasoning":
					currentPiCodex = {
						...currentPiCodex,
						voice: {
							...currentPiCodex.voice,
							contextReasoning: newValue as "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max",
						},
					};
					callbacks.onPiCodexChange(currentPiCodex);
					break;
				case "http-idle-timeout": {
					const choice = HTTP_IDLE_TIMEOUT_CHOICES.find((item) => item.label === newValue);
					if (choice) {
						callbacks.onHttpIdleTimeoutMsChange(choice.timeoutMs);
					}
					break;
				}
				case "hide-thinking":
					callbacks.onHideThinkingBlockChange(isEnabled(newValue));
					break;
				case "mermaid-rendering":
					callbacks.onMermaidRenderingModeChange(newValue as MermaidRenderingMode);
					break;
				case "cache-miss-notices":
					callbacks.onShowCacheMissNoticesChange(isEnabled(newValue));
					break;
				case "collapse-changelog":
					callbacks.onCollapseChangelogChange(isEnabled(newValue));
					break;
				case "quiet-startup":
					callbacks.onQuietStartupChange(isEnabled(newValue));
					break;
				case "install-telemetry":
					callbacks.onEnableInstallTelemetryChange(isEnabled(newValue));
					break;
				case "default-project-trust": {
					const defaultProjectTrust = DEFAULT_PROJECT_TRUST_BY_LABEL.get(newValue);
					if (defaultProjectTrust) {
						callbacks.onDefaultProjectTrustChange(defaultProjectTrust);
					}
					break;
				}
				case "double-escape-action":
					callbacks.onDoubleEscapeActionChange(newValue as "fork" | "tree" | "none");
					break;
				case "tree-filter-mode":
					callbacks.onTreeFilterModeChange(
						newValue as "default" | "no-tools" | "user-only" | "labeled-only" | "all",
					);
					break;
				case "show-hardware-cursor":
					callbacks.onShowHardwareCursorChange(isEnabled(newValue));
					break;
				case "editor-padding":
					callbacks.onEditorPaddingXChange(parseInt(newValue, 10));
					break;
				case "output-padding":
					callbacks.onOutputPadChange(newValue === "0" ? 0 : 1);
					break;
				case "autocomplete-max-visible":
					callbacks.onAutocompleteMaxVisibleChange(parseInt(newValue, 10));
					break;
				case "clear-on-shrink":
					callbacks.onClearOnShrinkChange(isEnabled(newValue));
					break;
				case "terminal-progress":
					callbacks.onShowTerminalProgressChange(isEnabled(newValue));
					break;
				case "tui-mode":
					callbacks.onTuiModeChange(newValue as TuiMode);
					break;
				case "fullscreen-exit-output":
					callbacks.onFullscreenExitOutputChange(newValue as FullscreenExitOutput);
					break;
				case "fullscreen-scrollbar":
					callbacks.onFullscreenScrollbarChange(newValue as ScrollViewScrollbar);
					break;
				case "theme":
					callbacks.onThemeChange(newValue);
					break;
			}
		};
		this.settingsList = this.createSettingsList();
		this.usageTab = options.usage ? new CodexUsageTab(options.usage, options.requestRender ?? (() => {})) : undefined;
		if (this.activeTab().id === "usage") this.usageTab?.ensureLoaded();
	}

	private activeTab(): (typeof SETTINGS_TABS)[number] {
		const tab = SETTINGS_TABS[this.activeTabIndex];
		if (!tab) throw new Error(`Invalid settings tab index: ${this.activeTabIndex}`);
		return tab;
	}

	private createSettingsList(): SettingsList {
		const tab = this.activeTab();
		const items = this.itemsByTab.get(tab.id);
		if (!items) throw new Error(`Settings tab has no item collection: ${tab.id}`);
		return new SettingsList(items, 6, getSettingsListTheme(), this.onSettingChange, this.onCancel, {
			descriptionLines: 2,
			enableSearch: true,
			fixedHeight: true,
			labelWidth: 26,
			showHint: false,
		});
	}

	private switchTab(delta: number): void {
		this.activeTabIndex = (this.activeTabIndex + delta + SETTINGS_TABS.length) % SETTINGS_TABS.length;
		this.settingsList = this.createSettingsList();
		if (this.activeTab().id === "usage") this.usageTab?.ensureLoaded();
	}

	override render(width: number): string[] {
		const activeTab = this.activeTab();
		const separator = `  ${theme.fg("dim", "/")}  `;
		const tabs = SETTINGS_TABS.map((tab) =>
			tab.id === activeTab.id ? theme.bold(theme.fg("accent", tab.label)) : theme.fg("dim", tab.label),
		).join(separator);
		const body =
			activeTab.id === "usage"
				? (this.usageTab?.render(width, SETTINGS_BODY_HEIGHT) ?? [
						theme.fg("error", "  Codex usage is unavailable."),
						...Array.from({ length: SETTINGS_BODY_HEIGHT - 1 }, () => ""),
					])
				: this.settingsList.render(width);
		const footer =
			activeTab.id === "usage"
				? `${keyDisplayText("app.settings.refreshUsage")} refresh · ${keyDisplayText("app.settings.consumeUsageReset")} use reset · Tab/Shift+Tab or ←/→ sections · Esc close`
				: "Type to filter · Enter change · Tab/Shift+Tab or ←/→ sections · Esc close";
		return [
			...this.border.render(width),
			`  ${tabs}`,
			theme.fg("muted", `  ${activeTab.description}`),
			"",
			...body,
			theme.fg("dim", `  ${footer}`),
			...this.border.render(width),
		].map((line) => truncateToWidth(line, width, ""));
	}

	override invalidate(): void {
		this.settingsList.invalidate();
	}

	handleInput(data: string): void {
		const kb = getKeybindings();
		const usageActive = this.activeTab().id === "usage";
		if ((usageActive || !this.settingsList.hasOpenSubmenu()) && kb.matches(data, "app.settings.nextTab")) {
			this.switchTab(1);
		} else if ((usageActive || !this.settingsList.hasOpenSubmenu()) && kb.matches(data, "app.settings.previousTab")) {
			this.switchTab(-1);
		} else if (usageActive && this.usageTab?.handleInput(data)) {
			return;
		} else if (usageActive && kb.matches(data, "tui.select.cancel")) {
			this.onCancel();
		} else {
			this.settingsList.handleInput(data);
		}
	}

	getActiveTabId(): (typeof SETTINGS_TABS)[number]["id"] {
		return this.activeTab().id;
	}

	getSettingsList(): SettingsList {
		return this.settingsList;
	}
}
