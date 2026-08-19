import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { type Api, type Model, modelsAreEqual } from "@earendil-works/pi-ai";
import { Container, type Focusable, getKeybindings, Spacer, Text } from "@earendil-works/pi-tui";
import type { ModelProfile } from "../../../core/model-profile.ts";
import {
	CODEX_PROFILE_CONTEXT_WINDOWS,
	CODEX_PROFILE_MODEL_IDS,
	CODEX_PROFILE_REASONING_LEVELS,
	modelProfileKey,
	type SavedModelProfile,
	savedModelProfile,
	withCodexProfileCapabilities,
} from "../../../product/model-profiles.ts";
import { theme } from "../theme/theme.ts";
import { DynamicBorder } from "./dynamic-border.ts";
import { keyText } from "./keybinding-hints.ts";

type ProfileColumn = "model" | "context" | "reasoning";

const COLUMNS: ProfileColumn[] = ["model", "context", "reasoning"];
const MODEL_LABELS: Record<string, string> = {
	"gpt-5.6-luna": "Luna",
	"gpt-5.6-terra": "Terra",
	"gpt-5.6-sol": "Sol",
};

export interface ModelSelectorCallbacks {
	onSelect: (profile: ModelProfile) => void;
	onSave: (profile: ModelProfile) => "saved" | "removed";
	onCancel: () => void;
}

export class ModelSelectorComponent extends Container implements Focusable {
	focused = false;
	private readonly models: Model<Api>[];
	private reasoningLevels: ThinkingLevel[];
	private readonly listContainer = new Container();
	private readonly callbacks: ModelSelectorCallbacks;
	private readonly savedProfileKeys: Set<string>;
	private columnIndex = 0;
	private modelIndex = 0;
	private contextIndex = 0;
	private reasoningIndex = 0;
	private statusMessage?: string;

	constructor(
		currentModel: Model<Api> | undefined,
		currentThinkingLevel: ThinkingLevel,
		availableModels: readonly Model<Api>[],
		savedProfiles: readonly SavedModelProfile[],
		callbacks: ModelSelectorCallbacks,
	) {
		super();
		this.callbacks = callbacks;
		this.savedProfileKeys = new Set(savedProfiles.map(modelProfileKey));
		const modelsById = new Map(availableModels.map((model) => [model.id, model]));
		this.models = CODEX_PROFILE_MODEL_IDS.flatMap((modelId) => {
			const model = modelsById.get(modelId);
			return model ? [withCodexProfileCapabilities(model)] : [];
		});
		this.modelIndex = Math.max(
			0,
			this.models.findIndex((model) => modelsAreEqual(model, currentModel)),
		);
		this.contextIndex = Math.max(
			0,
			CODEX_PROFILE_CONTEXT_WINDOWS.findIndex((contextWindow) => contextWindow === currentModel?.contextWindow),
		);
		this.reasoningLevels = [...CODEX_PROFILE_REASONING_LEVELS];
		this.reasoningIndex = Math.max(0, this.reasoningLevels.indexOf(currentThinkingLevel));

		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("accent", theme.bold("Model Profile")), 0, 0));
		this.addChild(new Spacer(1));
		this.addChild(this.listContainer);
		this.addChild(new Spacer(1));
		this.addChild(
			new Text(
				theme.fg(
					"muted",
					`←/→ column  ↑/↓ choice  enter apply  ${keyText("app.models.save")} save profile  esc cancel`,
				),
				0,
				0,
			),
		);
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());
		this.updateList();
	}

	private selectedProfile(): ModelProfile | undefined {
		const model = this.models[this.modelIndex];
		const contextWindow = CODEX_PROFILE_CONTEXT_WINDOWS[this.contextIndex];
		const thinkingLevel = this.reasoningLevels[this.reasoningIndex];
		return model && contextWindow && thinkingLevel ? { model, contextWindow, thinkingLevel } : undefined;
	}

	private renderHeading(label: string, column: ProfileColumn, width: number): string {
		const text = label.padEnd(width);
		return this.activeColumn === column ? theme.fg("accent", theme.bold(text)) : theme.fg("muted", text);
	}

	private renderChoice(value: string | undefined, selected: boolean, active: boolean, width: number): string {
		if (!value) return "".padEnd(width);
		const prefix = active ? "→ " : "  ";
		const text = `${prefix}${value}`.padEnd(width);
		return selected ? theme.fg("accent", text) : theme.fg("muted", text);
	}

	private get activeColumn(): ProfileColumn {
		return COLUMNS[this.columnIndex] ?? "model";
	}

	private updateList(): void {
		this.listContainer.clear();
		if (this.models.length === 0) {
			this.listContainer.addChild(new Text(theme.fg("error", "No Luna, Terra, or Sol models are available."), 0, 0));
			return;
		}

		const widths = { model: 18, context: 15, reasoning: 14 };
		this.listContainer.addChild(
			new Text(
				this.renderHeading("Model", "model", widths.model) +
					this.renderHeading("Context", "context", widths.context) +
					this.renderHeading("Reasoning", "reasoning", widths.reasoning),
				0,
				0,
			),
		);

		const rowCount = Math.max(this.models.length, CODEX_PROFILE_CONTEXT_WINDOWS.length, this.reasoningLevels.length);
		for (let index = 0; index < rowCount; index++) {
			const model = this.models[index];
			const contextWindow = CODEX_PROFILE_CONTEXT_WINDOWS[index];
			const reasoning = this.reasoningLevels[index];
			const line =
				this.renderChoice(
					model ? (MODEL_LABELS[model.id] ?? model.name ?? model.id) : undefined,
					index === this.modelIndex,
					this.activeColumn === "model" && index === this.modelIndex,
					widths.model,
				) +
				this.renderChoice(
					contextWindow ? `${contextWindow / 1000}k` : undefined,
					index === this.contextIndex,
					this.activeColumn === "context" && index === this.contextIndex,
					widths.context,
				) +
				this.renderChoice(
					reasoning,
					index === this.reasoningIndex,
					this.activeColumn === "reasoning" && index === this.reasoningIndex,
					widths.reasoning,
				);
			this.listContainer.addChild(new Text(line, 0, 0));
		}
		const selected = this.selectedProfile();
		if (selected) {
			const isSaved = this.savedProfileKeys.has(modelProfileKey(savedModelProfile(selected)));
			this.listContainer.addChild(new Spacer(1));
			this.listContainer.addChild(
				new Text(theme.fg(isSaved ? "success" : "muted", isSaved ? "Saved for model cycling" : "Not saved"), 0, 0),
			);
		}

		if (this.statusMessage) {
			this.listContainer.addChild(new Spacer(1));
			this.listContainer.addChild(new Text(theme.fg("success", this.statusMessage), 0, 0));
		}
	}

	private moveChoice(delta: number): void {
		if (this.activeColumn === "model") {
			this.modelIndex = (this.modelIndex + delta + this.models.length) % this.models.length;
		} else if (this.activeColumn === "context") {
			this.contextIndex =
				(this.contextIndex + delta + CODEX_PROFILE_CONTEXT_WINDOWS.length) % CODEX_PROFILE_CONTEXT_WINDOWS.length;
		} else {
			this.reasoningIndex =
				(this.reasoningIndex + delta + this.reasoningLevels.length) % this.reasoningLevels.length;
		}
		this.statusMessage = undefined;
		this.updateList();
	}

	handleInput(keyData: string): void {
		const kb = getKeybindings();
		if (kb.matches(keyData, "tui.editor.cursorLeft")) {
			this.columnIndex = (this.columnIndex - 1 + COLUMNS.length) % COLUMNS.length;
			this.updateList();
		} else if (kb.matches(keyData, "tui.editor.cursorRight")) {
			this.columnIndex = (this.columnIndex + 1) % COLUMNS.length;
			this.updateList();
		} else if (kb.matches(keyData, "tui.select.up")) {
			this.moveChoice(-1);
		} else if (kb.matches(keyData, "tui.select.down")) {
			this.moveChoice(1);
		} else if (kb.matches(keyData, "app.models.save")) {
			const profile = this.selectedProfile();
			if (!profile) return;
			const result = this.callbacks.onSave(profile);
			const key = modelProfileKey(savedModelProfile(profile));
			if (result === "saved") this.savedProfileKeys.add(key);
			else this.savedProfileKeys.delete(key);
			this.statusMessage =
				result === "saved" ? "Profile saved for model cycling." : "Profile removed from model cycling.";
			this.updateList();
		} else if (kb.matches(keyData, "tui.select.confirm")) {
			const profile = this.selectedProfile();
			if (profile) this.callbacks.onSelect(profile);
		} else if (kb.matches(keyData, "tui.select.cancel")) {
			this.callbacks.onCancel();
		}
	}
}
