import type { Context, Tool } from "../types.ts";

type ToolNameNormalizer = (name: string) => string;

const identityToolName: ToolNameNormalizer = (name) => name;

interface SplitDeferredToolsOptions {
	normalizeName?: ToolNameNormalizer;
	includeDeveloperMessages?: boolean;
}

/** Split current tools into prefix and transcript-loaded definitions. */
export function splitDeferredTools(
	context: Context,
	enabled: boolean,
	options: SplitDeferredToolsOptions = {},
): { immediate: Tool[]; deferred: Map<string, Tool> } {
	const normalizeName = options.normalizeName ?? identityToolName;
	const uniqueTools = new Map<string, Tool>();
	for (const tool of context.tools ?? []) uniqueTools.set(normalizeName(tool.name), tool);
	if (!enabled) return { immediate: [...uniqueTools.values()], deferred: new Map() };

	const deferredNames = new Set<string>();
	const usedNames = new Set<string>();
	for (const message of context.messages) {
		if (message.role === "assistant") {
			for (const block of message.content) {
				if (block.type === "toolCall") usedNames.add(normalizeName(block.name));
			}
		} else if (
			message.role === "toolResult" ||
			(options.includeDeveloperMessages === true && message.role === "developer")
		) {
			for (const name of message.addedToolNames ?? []) {
				const normalizedName = normalizeName(name);
				if (!usedNames.has(normalizedName)) deferredNames.add(normalizedName);
			}
		}
	}

	const immediate: Tool[] = [];
	const deferred = new Map<string, Tool>();
	for (const [name, tool] of uniqueTools) {
		if (deferredNames.has(name)) deferred.set(name, tool);
		else immediate.push(tool);
	}
	return { immediate, deferred };
}
