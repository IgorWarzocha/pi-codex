import type { InlineExtension } from "../core/extensions/types.ts";
import piCodexExtension from "../extensions/pi-codex/index.ts";

export const productExtensions: InlineExtension[] = [{ name: "Pi-Codex", factory: piCodexExtension, hidden: true }];
