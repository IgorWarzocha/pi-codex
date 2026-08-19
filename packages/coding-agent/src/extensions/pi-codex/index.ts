import type { ExtensionAPI } from "../../core/extensions/types.ts";
import { registerPiCodexBackgroundShell } from "./background-shell.ts";
import { registerPiCodexCompaction } from "./compaction.ts";
import { registerPiCodexGuide } from "./guide.ts";
import { registerPiCodexUsage } from "./usage.ts";
import { registerPiCodexVoice } from "./voice.ts";

export default function piCodexExtension(pi: ExtensionAPI): void {
	registerPiCodexCompaction(pi);
	registerPiCodexGuide(pi);
	registerPiCodexBackgroundShell(pi);
	registerPiCodexUsage(pi);
	registerPiCodexVoice(pi);
}
