import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionUIContext } from "../core/extensions/types.ts";
import type { SessionManager } from "../core/session-manager.ts";

export interface CodexDiagnosticsContext {
	cwd: string;
	model: Model<Api> | undefined;
	sessionManager: SessionManager;
	ui: Pick<ExtensionUIContext, "notify" | "setStatus" | "theme">;
}
