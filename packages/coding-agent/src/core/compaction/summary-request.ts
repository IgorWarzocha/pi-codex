import type { Context, Message, TextContent, ToolResultMessage } from "@earendil-works/pi-ai";

const CHARS_PER_TOKEN = 4;
const ESTIMATED_IMAGE_CHARS = 4800;
const SHORTENED_TOOL_RESULT_MARKER = "[Tool result shortened for summary request]";

function jsonLength(value: unknown): number {
	return JSON.stringify(value)?.length ?? 0;
}

function estimateContentChars(content: Message["content"]): number {
	if (typeof content === "string") return content.length;

	let chars = 0;
	for (const block of content) {
		if (block.type === "text") {
			chars += block.text.length;
		} else if (block.type === "image") {
			chars += ESTIMATED_IMAGE_CHARS;
		} else if (block.type === "thinking") {
			chars += block.thinking.length;
		} else {
			chars += block.name.length + jsonLength(block.arguments);
		}
	}
	return chars;
}

function estimateContextTokens(context: Context): number {
	let chars = context.systemPrompt?.length ?? 0;
	chars += jsonLength(context.tools);
	for (const message of context.messages) chars += estimateContentChars(message.content);
	return Math.ceil(chars / CHARS_PER_TOKEN);
}

function shortenToolResultContent(
	content: ToolResultMessage["content"],
	maxChars: number,
): ToolResultMessage["content"] {
	const contentBudget = Math.max(0, maxChars - SHORTENED_TOOL_RESULT_MARKER.length);
	const shortened: ToolResultMessage["content"] = [];
	let usedChars = 0;

	for (const block of content) {
		if (block.type === "image") {
			if (usedChars + ESTIMATED_IMAGE_CHARS > contentBudget) break;
			shortened.push(block);
			usedChars += ESTIMATED_IMAGE_CHARS;
			continue;
		}

		const remaining = contentBudget - usedChars;
		if (remaining <= 0) break;
		if (block.text.length <= remaining) {
			shortened.push(block);
			usedChars += block.text.length;
			continue;
		}

		shortened.push({ type: "text", text: block.text.slice(0, remaining) });
		break;
	}

	const marker: TextContent = { type: "text", text: SHORTENED_TOOL_RESULT_MARKER };
	shortened.push(marker);
	return shortened;
}

/**
 * Append summary instructions to a normal provider context without flattening its history.
 * Only the copied request is shortened, starting with the newest tool results so the longest
 * possible provider-cache prefix remains unchanged.
 */
export function buildSummaryRequestContext(
	baseContext: Context,
	instructions: string,
	contextWindow: number,
	reserveTokens: number,
): Context {
	const inputLimit = contextWindow - reserveTokens;
	const context: Context = {
		...baseContext,
		messages: [
			...baseContext.messages,
			{
				role: "user",
				content: [{ type: "text", text: instructions }],
				timestamp: Date.now(),
			},
		],
	};

	let estimatedTokens = estimateContextTokens(context);
	for (let i = context.messages.length - 2; i >= 0 && estimatedTokens > inputLimit; i--) {
		const message = context.messages[i];
		if (message.role !== "toolResult") continue;

		const contentChars = estimateContentChars(message.content);
		const excessChars = (estimatedTokens - inputLimit) * CHARS_PER_TOKEN;
		const maxChars = Math.max(SHORTENED_TOOL_RESULT_MARKER.length, contentChars - excessChars);
		if (maxChars >= contentChars) continue;

		context.messages[i] = {
			...message,
			content: shortenToolResultContent(message.content, maxChars),
		};
		estimatedTokens = estimateContextTokens(context);
	}

	if (estimatedTokens > inputLimit) {
		throw new Error(
			`Summary request is too large: estimated ${estimatedTokens} input tokens exceed the ${inputLimit}-token limit with ${reserveTokens} tokens reserved for output`,
		);
	}

	return context;
}
