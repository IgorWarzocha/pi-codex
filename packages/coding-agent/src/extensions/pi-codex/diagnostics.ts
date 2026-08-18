import { resolveNativePiCodexConfig } from "../../adapter/activation/config.ts";
import { getAgentDir } from "../../config.ts";
import type { ExtensionAPI, ExtensionContext } from "../../core/extensions/types.ts";
import { SettingsManager } from "../../core/settings-manager.ts";
import { createLazyCodexDiagnostics } from "../../diagnostics/lazy.ts";
import type { CodexDiagnosticsSink } from "../../diagnostics/types.ts";

const diagnosticsRegistryKey = Symbol.for("@earendil-works/pi-ai/openai-codex-diagnostics");
const diagnosticsRegistry = globalThis as typeof globalThis & { [key: symbol]: unknown };

function setGlobalSink(sink: CodexDiagnosticsSink | undefined): void {
	diagnosticsRegistry[diagnosticsRegistryKey] = { sink };
}

export function registerPiCodexDiagnostics(pi: ExtensionAPI): void {
	const diagnostics = createLazyCodexDiagnostics();
	const configure = async (ctx: ExtensionContext) => {
		const settings = SettingsManager.create(ctx.cwd, getAgentDir(), { projectTrusted: ctx.isProjectTrusted() });
		const config = resolveNativePiCodexConfig({
			settings: settings.getPiCodexSettings(),
			executionMode: settings.getExecutionMode(),
			notebook: settings.getNotebookSettings(),
		});
		await diagnostics.configure({
			mode: config.openai.cacheDiagnostics,
			active: ctx.model?.provider === "openai-codex",
			ctx,
			agentDir: getAgentDir(),
		});
		setGlobalSink(diagnostics.sink());
	};
	pi.on("session_start", (_event, ctx) => configure(ctx));
	pi.on("model_select", (_event, ctx) => configure(ctx));
	pi.on("before_agent_start", (_event, ctx) => configure(ctx));
	pi.on("session_shutdown", async () => {
		setGlobalSink(undefined);
		await diagnostics.shutdown();
	});
}
