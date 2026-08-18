import type { ExtensionAPI } from "../../core/extensions/types.ts";
import { registerPiCodexBackgroundShell } from "./background-shell.ts";
import { registerPiCodexCache } from "./cache.ts";
import { registerPiCodexCompaction } from "./compaction.ts";
import { registerPiCodexDiagnostics } from "./diagnostics.ts";
import { registerPiCodexUsage } from "./usage.ts";
import { registerPiCodexVoice } from "./voice.ts";

export default function piCodexExtension(pi: ExtensionAPI): void {
	registerPiCodexCompaction(pi);
	registerPiCodexBackgroundShell(pi);
	registerPiCodexDiagnostics(pi);
	registerPiCodexCache(pi);
	registerPiCodexUsage(pi);
	registerPiCodexVoice(pi);
}
