/**
 * Branch summarization for tree navigation.
 *
 * When navigating to a different point in the session tree, this generates
 * a summary of the branch being left so context isn't lost.
 */

import type { AgentMessage, StreamFn, ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { RetryCallbacks, RetryPolicy } from "@earendil-works/pi-ai";
import { contentText } from "@earendil-works/pi-ai";
import type { Context, Model, Usage } from "@earendil-works/pi-ai/compat";
import { createBranchSummaryMessage, createCompactionSummaryMessage, createCustomMessage } from "../messages.ts";
import type { ReadonlySessionManager, SessionEntry } from "../session-manager.ts";
import {
	completeSummarization,
	createSummarizationOptions,
	getSummarizationFailure,
	type SummarizationRequestConfig,
} from "./compaction.ts";
import { buildSummaryRequestContext, describeSummaryScope } from "./summary-request.ts";
import {
	computeFileLists,
	createFileOps,
	extractFileOpsFromMessage,
	type FileOperations,
	formatFileOperations,
} from "./utils.ts";

// ============================================================================
// Types
// ============================================================================

export interface BranchSummaryResult {
	summary?: string;
	usage?: Usage;
	readFiles?: string[];
	modifiedFiles?: string[];
	aborted?: boolean;
	error?: string;
}

/** Details stored in BranchSummaryEntry.details for file tracking */
export interface BranchSummaryDetails {
	readFiles: string[];
	modifiedFiles: string[];
}

export type { FileOperations } from "./utils.ts";

export interface BranchPreparation {
	/** Messages extracted for summarization, in chronological order */
	messages: AgentMessage[];
	/** File operations extracted from tool calls */
	fileOps: FileOperations;
}

export interface CollectEntriesResult {
	/** Entries to summarize, in chronological order */
	entries: SessionEntry[];
	/** Common ancestor between old and new position, if any */
	commonAncestorId: string | null;
}

export interface GenerateBranchSummaryOptions {
	/** Model to use for summarization */
	model: Model<any>;
	/** API key for the model */
	apiKey?: string;
	/** Request headers for the model */
	headers?: Record<string, string>;
	/** Provider-scoped environment values for the model */
	env?: Record<string, string>;
	/** Abort signal for cancellation */
	signal: AbortSignal;
	/** Optional custom instructions for summarization */
	customInstructions?: string;
	/** If true, customInstructions replaces the default prompt instead of being appended */
	replaceInstructions?: boolean;
	/** Output headroom reserved when preparing the request (default 16384) */
	reserveTokens?: number;
	/** Active session thinking level, preserved for the summary request. */
	thinkingLevel?: ThinkingLevel;
	/** Optional session stream function. Used to preserve SDK request behavior without mutating agent state. */
	streamFn?: StreamFn;
	/** Retry policy for transient summarization errors. Reuses coding-agent's `settings.retry`. */
	retry?: RetryPolicy;
	/** Optional callbacks for retry reporting (e.g. TUI retry indicators). */
	callbacks?: RetryCallbacks;
	/** Prepared normal request context and routing options used by AgentSession. */
	requestConfig: SummarizationRequestConfig;
}

// ============================================================================
// Entry Collection
// ============================================================================

/**
 * Collect entries that should be summarized when navigating from one position to another.
 *
 * Walks from oldLeafId back to the common ancestor with targetId, collecting entries
 * along the way. Does NOT stop at compaction boundaries - those are included and their
 * summaries become context.
 *
 * @param session - Session manager (read-only access)
 * @param oldLeafId - Current position (where we're navigating from)
 * @param targetId - Target position (where we're navigating to)
 * @returns Entries to summarize and the common ancestor
 */
export function collectEntriesForBranchSummary(
	session: ReadonlySessionManager,
	oldLeafId: string | null,
	targetId: string,
): CollectEntriesResult {
	// If no old position, nothing to summarize
	if (!oldLeafId) {
		return { entries: [], commonAncestorId: null };
	}

	// Find common ancestor (deepest node that's on both paths)
	const oldPath = new Set(session.getBranch(oldLeafId).map((e) => e.id));
	const targetPath = session.getBranch(targetId);

	// targetPath is root-first, so iterate backwards to find deepest common ancestor
	let commonAncestorId: string | null = null;
	for (let i = targetPath.length - 1; i >= 0; i--) {
		if (oldPath.has(targetPath[i].id)) {
			commonAncestorId = targetPath[i].id;
			break;
		}
	}

	// Collect entries from old leaf back to common ancestor
	const entries: SessionEntry[] = [];
	let current: string | null = oldLeafId;

	while (current && current !== commonAncestorId) {
		const entry = session.getEntry(current);
		if (!entry) break;
		entries.push(entry);
		current = entry.parentId;
	}

	// Reverse to get chronological order
	entries.reverse();

	return { entries, commonAncestorId };
}

// ============================================================================
// Entry to Message Conversion
// ============================================================================

/**
 * Extract AgentMessage from a session entry.
 * Similar to getMessageFromEntry in compaction.ts but also handles compaction entries.
 */
function getMessageFromEntry(entry: SessionEntry): AgentMessage | undefined {
	switch (entry.type) {
		case "message":
			return entry.message;

		case "custom_message":
			return createCustomMessage(entry.customType, entry.content, entry.display, entry.details, entry.timestamp);

		case "branch_summary":
			return createBranchSummaryMessage(entry.summary, entry.fromId, entry.timestamp);

		case "compaction":
			return createCompactionSummaryMessage(entry.summary, entry.tokensBefore, entry.timestamp);

		// These don't contribute to conversation content
		case "thinking_level_change":
		case "model_change":
		case "custom":
		case "label":
		case "session_info":
			return undefined;
	}
}

/**
 * Extract the selected messages and cumulative file operations.
 * Request sizing belongs to buildSummaryRequestContext, not entry selection.
 *
 * Also collects file operations from:
 * - Tool calls in assistant messages
 * - Existing branch_summary entries' details (for cumulative tracking)
 *
 * @param entries - Entries in chronological order
 */
export function prepareBranchEntries(entries: SessionEntry[]): BranchPreparation {
	const messages: AgentMessage[] = [];
	const fileOps = createFileOps();

	// Only extract from pi-generated summaries (fromHook !== true), not extension-generated ones
	for (const entry of entries) {
		if (entry.type === "branch_summary" && !entry.fromHook && entry.details) {
			const details = entry.details as BranchSummaryDetails;
			if (Array.isArray(details.readFiles)) {
				for (const f of details.readFiles) fileOps.read.add(f);
			}
			if (Array.isArray(details.modifiedFiles)) {
				// Modified files go into both edited and written for proper deduplication
				for (const f of details.modifiedFiles) {
					fileOps.edited.add(f);
				}
			}
		}
		const message = getMessageFromEntry(entry);
		if (!message) continue;

		extractFileOpsFromMessage(message, fileOps);
		messages.push(message);
	}

	return { messages, fileOps };
}

// ============================================================================
// Summary Generation
// ============================================================================

const BRANCH_SUMMARY_PREAMBLE = `The user explored a different conversation branch before returning here.
Summary of that exploration:

`;

const BRANCH_SUMMARY_PROMPT = `Create a structured summary of this conversation branch for context when returning later.

The following summary structure is REQUIRED. You MUST preserve all headings and their order:

## Goal
[What was the user trying to accomplish in this branch?]

## Constraints & Preferences
- [Any constraints, preferences, or requirements mentioned]
- [Or "(none)" if none were mentioned]

## Progress
### Done
- [x] [Completed tasks/changes]

### In Progress
- [ ] [Work that was started but not finished]

### Blocked
- [Issues preventing progress, if any]

## Key Decisions
- **[Decision]**: [Brief rationale]

## Next Steps
1. [Remaining steps already identified in the branch, or "(none recorded)"]

Keep each section concise. Preserve exact file paths, function names, and error messages.`;

/**
 * Generate a summary of abandoned branch entries.
 *
 * @param entries - Session entries to summarize (chronological order)
 * @param options - Generation options
 */
export async function generateBranchSummary(
	entries: SessionEntry[],
	options: GenerateBranchSummaryOptions,
): Promise<BranchSummaryResult> {
	const {
		model,
		apiKey,
		headers,
		env,
		signal,
		customInstructions,
		replaceInstructions,
		reserveTokens = 16384,
		thinkingLevel,
		streamFn,
		retry,
		callbacks,
		requestConfig,
	} = options;

	const { messages, fileOps } = prepareBranchEntries(entries);

	if (messages.length === 0) {
		return { summary: "No content to summarize" };
	}

	// Build prompt
	let instructions: string;
	if (replaceInstructions && customInstructions) {
		instructions = customInstructions;
	} else if (customInstructions) {
		instructions = `${BRANCH_SUMMARY_PROMPT}\n\nAdditional focus: ${customInstructions}`;
	} else {
		instructions = BRANCH_SUMMARY_PROMPT;
	}
	const promptText = `${instructions}\n\n${describeSummaryScope(requestConfig.context, messages)}`;

	const maxTokens = Math.min(reserveTokens, 4096, model.maxTokens > 0 ? model.maxTokens : Number.POSITIVE_INFINITY);

	// Call LLM for summarization. Prefer the session stream function so SDK
	// request behavior (timeouts, retries, attribution headers) stays consistent
	// without running through agent state/events. Retried via completeSummarization
	// so transient stream drops reuse the configured retry policy.
	const context: Context = buildSummaryRequestContext(
		requestConfig.context,
		promptText,
		model.contextWindow,
		reserveTokens,
	);
	const requestOptions = createSummarizationOptions(
		model,
		maxTokens,
		apiKey,
		headers,
		env,
		signal,
		thinkingLevel,
		requestConfig,
	);
	const response = await completeSummarization(model, context, requestOptions, streamFn, retry, callbacks);

	// Check if aborted or errored
	if (response.stopReason === "aborted") {
		return { aborted: true };
	}
	const failure = getSummarizationFailure(response, "Branch summarization");
	if (failure) {
		return { error: failure };
	}
	if (response.content.some((block) => block.type === "toolCall")) {
		return { error: "Branch summarization attempted to call a tool" };
	}

	let summary = contentText(response.content);

	// Prepend preamble to provide context about the branch summary
	summary = BRANCH_SUMMARY_PREAMBLE + summary;

	// Compute file lists and append to summary
	const { readFiles, modifiedFiles } = computeFileLists(fileOps);
	summary += formatFileOperations(readFiles, modifiedFiles);

	return {
		summary: summary || "No summary generated",
		usage: response.usage,
		readFiles,
		modifiedFiles,
	};
}
