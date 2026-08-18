import type { InlineExtension } from "../core/extensions/types.ts";
import llamaExtension from "./llama/index.ts";
import piCodexExtension from "./pi-codex/index.ts";

export const builtInExtensions: InlineExtension[] = [
	{ name: "Pi-Codex", factory: piCodexExtension, hidden: true },
	{ name: "llama.cpp", factory: llamaExtension, hidden: true },
];
