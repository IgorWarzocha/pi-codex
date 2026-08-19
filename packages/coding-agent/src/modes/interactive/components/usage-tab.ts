import { getKeybindings, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { createCodexRateLimitResetRedeemRequestId } from "../../../codex-usage/client.ts";
import type {
	CodexRateLimitResetConsumeResult,
	CodexRateLimitResetCredit,
	CodexUsageSnapshot,
} from "../../../codex-usage/payload.ts";
import { theme } from "../theme/theme.ts";
import { keyDisplayText } from "./keybinding-hints.ts";

export interface CodexUsageActions {
	fetch(): Promise<CodexUsageSnapshot>;
	consumeReset(redeemRequestId: string): Promise<CodexRateLimitResetConsumeResult>;
}

type UsageState = CodexUsageSnapshot | { error: string } | undefined;

export class CodexUsageTab {
	private readonly actions: CodexUsageActions;
	private readonly requestRender: () => void;
	private usageState: UsageState;
	private usageLoading = false;
	private resetLoading = false;
	private resetLockedUntilRefresh = false;
	private resetRedeemRequestId: string | undefined;
	private resetMessage: { kind: "info" | "error"; text: string } | undefined;

	constructor(actions: CodexUsageActions, requestRender: () => void) {
		this.actions = actions;
		this.requestRender = requestRender;
	}

	ensureLoaded(): void {
		if (!this.usageState) this.load();
	}

	handleInput(data: string): boolean {
		const keybindings = getKeybindings();
		if (keybindings.matches(data, "app.settings.refreshUsage")) {
			if (!this.resetLoading) this.load(true);
			return true;
		}
		if (keybindings.matches(data, "app.settings.consumeUsageReset")) {
			this.consumeReset();
			return true;
		}
		return false;
	}

	render(width: number, height: number): string[] {
		const lines = formatUsageLines(
			this.usageState,
			this.usageLoading,
			this.resetLoading,
			this.resetLockedUntilRefresh,
			this.resetMessage,
		);
		const visible = lines.slice(0, height).map((line) => truncateToWidth(line, width, ""));
		while (visible.length < height) visible.push("");
		return visible;
	}

	private load(unlockReset = false): void {
		if (this.usageLoading) return;
		this.usageLoading = true;
		this.requestRender();
		this.actions
			.fetch()
			.then((usage) => {
				this.usageState = usage;
				if (unlockReset) {
					this.resetLockedUntilRefresh = false;
					this.resetRedeemRequestId = undefined;
					this.resetMessage = undefined;
				}
			})
			.catch((error: unknown) => {
				this.usageState = { error: error instanceof Error ? error.message : String(error) };
			})
			.finally(() => {
				this.usageLoading = false;
				this.requestRender();
			});
	}

	private consumeReset(): void {
		if (this.resetLoading || this.usageLoading) return;
		if (this.resetLockedUntilRefresh) {
			this.resetMessage = { kind: "info", text: "Refresh usage before using another reset." };
			this.requestRender();
			return;
		}
		if (!canConsumeResetCredit(this.usageState)) return;

		this.resetLoading = true;
		this.resetMessage = undefined;
		this.resetRedeemRequestId ??= createCodexRateLimitResetRedeemRequestId();
		const redeemRequestId = this.resetRedeemRequestId;
		this.requestRender();
		this.actions
			.consumeReset(redeemRequestId)
			.then((result) => {
				this.resetMessage = {
					kind: result.outcome === "reset" || result.outcome === "already_redeemed" ? "info" : "error",
					text: formatResetConsumeResult(result),
				};
				this.resetLockedUntilRefresh = true;
				this.resetRedeemRequestId = undefined;
				this.usageState = undefined;
				this.load();
			})
			.catch((error: unknown) => {
				this.resetMessage = {
					kind: "error",
					text: `${error instanceof Error ? error.message : String(error)} Retry the same reset or refresh usage.`,
				};
			})
			.finally(() => {
				this.resetLoading = false;
				this.requestRender();
			});
	}
}

function formatUsageLines(
	usageState: UsageState,
	usageLoading: boolean,
	resetLoading: boolean,
	resetLockedUntilRefresh: boolean,
	resetMessage: { kind: "info" | "error"; text: string } | undefined,
): string[] {
	if (!usageState) return [theme.fg("dim", "  Loading Codex usage…")];
	if ("error" in usageState) {
		return [theme.fg("error", `  ${usageState.error}`), theme.fg("dim", "  Refresh to retry.")];
	}

	const rows = usageState.limits.map((limit) => {
		const primary = usageColumns(limit.primary);
		const secondary = usageColumns(limit.secondary);
		return [
			limit.limitName ?? limit.limitId,
			primary.bar,
			primary.percent,
			primary.reset,
			secondary.bar,
			secondary.percent,
			secondary.reset,
		];
	});
	const headers = ["Limit", "5h left", "", "Reset", "Weekly left", "", "Reset"];
	const widths = columnWidths([headers, ...rows]);
	return [
		`  ${theme.bold(`Codex usage${usageState.planType ? ` · ${usageState.planType}` : ""}`)}${usageLoading ? theme.fg("dim", "  refreshing…") : ""}`,
		...formatResetCreditLines(usageState, resetLoading, resetLockedUntilRefresh, resetMessage),
		"",
		formatUsageRow(
			headers.map((header) => theme.fg("dim", header)),
			widths,
		),
		theme.fg(
			"borderMuted",
			`  ${"─".repeat(widths.reduce((sum, width) => sum + width, 0) + 2 * (widths.length - 1))}`,
		),
		...rows.map((row) => formatUsageRow(row, widths)),
	];
}

function canConsumeResetCredit(usageState: UsageState): boolean {
	return Boolean(usageState && !("error" in usageState) && (usageState.resetCredits?.availableCount ?? 0) > 0);
}

function formatResetCreditLines(
	usageState: CodexUsageSnapshot,
	resetLoading: boolean,
	resetLockedUntilRefresh: boolean,
	resetMessage: { kind: "info" | "error"; text: string } | undefined,
): string[] {
	const count = usageState.resetCredits?.availableCount;
	const hint =
		count && count > 0
			? theme.fg(
					"dim",
					resetLockedUntilRefresh
						? "  refresh before another reset"
						: `  ${keyDisplayText("app.settings.consumeUsageReset")} to use one`,
				)
			: "";
	const lines = [
		`  Banked resets: ${theme.bold(count === undefined ? "unknown" : String(count))}${hint}${resetLoading ? theme.fg("dim", "  resetting…") : ""}`,
	];
	if (count && count > 0) {
		lines.push(theme.fg("dim", `  Expires: ${formatResetCreditExpiries(usageState.resetCredits?.credits ?? [])}`));
	}
	if (resetMessage) {
		lines.push(
			resetMessage.kind === "error"
				? theme.fg("error", `  ${resetMessage.text}`)
				: theme.fg("accent", `  ${resetMessage.text}`),
		);
	}
	return lines;
}

function formatResetCreditExpiries(credits: CodexRateLimitResetCredit[]): string {
	const expiringCredits = credits
		.map((credit) => ({ credit, expiresAtMs: credit.expiresAt ? Date.parse(credit.expiresAt) : Number.NaN }))
		.filter(
			(item) => Number.isFinite(item.expiresAtMs) && (!item.credit.status || item.credit.status === "available"),
		)
		.sort((left, right) => left.expiresAtMs - right.expiresAtMs);
	if (expiringCredits.length === 0) return "unknown";
	const shown = expiringCredits
		.slice(0, 3)
		.map((item, index) => `#${index + 1} ${formatResetCreditExpiry(item.expiresAtMs)}`);
	const hiddenCount = expiringCredits.length - shown.length;
	return `${shown.join(" · ")}${hiddenCount > 0 ? ` · +${hiddenCount} more` : ""}`;
}

function formatResetCreditExpiry(expiresAtMs: number): string {
	const minutes = Math.round((expiresAtMs - Date.now()) / 60_000);
	if (minutes <= 0) return "expired";
	if (minutes < 90) return `in ~${minutes}m`;
	if (minutes < 60 * 48) return `in ~${Math.round(minutes / 60)}h`;
	return `in ~${Math.round(minutes / 1440)}d`;
}

function formatResetConsumeResult(result: CodexRateLimitResetConsumeResult): string {
	if (result.outcome === "reset") return "Codex rate limits reset.";
	if (result.outcome === "already_redeemed") return "Reset already applied; refreshed usage.";
	if (result.outcome === "nothing_to_reset") return "No active Codex limit to reset.";
	if (result.outcome === "no_credit") return "No banked resets available.";
	return "Reset response was not recognized; refreshed usage.";
}

function columnWidths(rows: string[][]): number[] {
	const columnCount = Math.max(...rows.map((row) => row.length));
	return Array.from({ length: columnCount }, (_, index) =>
		Math.max(...rows.map((row) => visibleWidth(row[index] ?? ""))),
	);
}

function padCell(value: string, width: number): string {
	return value + " ".repeat(Math.max(0, width - visibleWidth(value)));
}

function formatUsageRow(row: string[], widths: number[]): string {
	return `  ${row.map((cell, index) => padCell(cell, widths[index] ?? 0)).join("  ")}`;
}

function usageColumns(
	window:
		| { usedPercent?: number | undefined; windowMinutes?: number | undefined; resetsAt?: number | undefined }
		| undefined,
): { bar: string; percent: string; reset: string } {
	if (!window) return { bar: "", percent: "", reset: "" };
	const percent = window.usedPercent === undefined ? undefined : 100 - Math.max(0, Math.min(100, window.usedPercent));
	return {
		bar: usageBar(percent),
		percent: percent === undefined ? "?%" : `${Math.round(percent)}%`,
		reset: formatResetShort(window.resetsAt),
	};
}

function usageBar(percent: number | undefined): string {
	if (percent === undefined) return "░░░░░░░░░░";
	const filled = Math.max(0, Math.min(10, Math.round(percent / 10)));
	return "█".repeat(filled) + "░".repeat(10 - filled);
}

function formatResetShort(timestampSeconds: number | undefined): string {
	if (!timestampSeconds) return "reset ?";
	const minutes = Math.max(0, Math.round((timestampSeconds * 1000 - Date.now()) / 60_000));
	if (minutes < 90) return `~${minutes}m`;
	if (minutes < 60 * 48) return `~${Math.round(minutes / 60)}h`;
	return `~${Math.round(minutes / 1440)}d`;
}
