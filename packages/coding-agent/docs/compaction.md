# Compaction and Cache Continuity

Long sessions eventually need less context. Pi-Codex defaults to OpenAI Responses Compaction V2: the service creates an encrypted compaction checkpoint and Pi-Codex replays it through the Codex session runtime before the next request.

## Default behavior

`piCodex.compaction.responsesCompaction` is enabled by default. Pi-Codex uses it for Codex sessions and retains an approximate recent user-message window around encrypted checkpoints. Choose `16`, `32`, or `64` with `piCodex.compaction.v2UserMessageRetention`; `64` is the default.

Use `/compact [prompt]` to request compaction now. Automatic compaction also runs when the current request would exceed the available context budget.

The checkpoint itself is opaque to Pi-Codex. The session still records enough local state to continue, export, branch, and resume safely.

## Cache policy

Prompt-cache continuity is deliberate product behavior:

- Code/Notebook system prompts, tool order, model profile, and request settings stay stable where possible.
- Cached WebSockets and continuation state are kept warm by default.
- Optional cache keepalive refreshes an idle cached context every 25 minutes.
- Codex prompt-cache lifetime is treated as 30 minutes.
- Cache diagnostics can show status, or status plus safe diagnostic metadata, through Settings.

Changing system prompt content, tool definitions, model profile, context window, reasoning, or request settings can break cache continuity. That is expected rather than an error.

## Branch summaries

Navigating older leaves can require a summary. Pi-Codex runs the summary as a hidden Codex turn using the existing session settings, then stores the result as a visible developer message that does not begin another turn. The next request continues from the stable history prefix instead of replacing the session with an opaque one-off summary path.

The transcript indicates that work is in progress while the hidden turn runs. The resulting developer summary is visible to both the user and the agent.

## Fallbacks

The retained Pi core still has generic summary and compaction primitives for compatibility. Pi-Codex uses them only when the Responses Compaction V2 path is unavailable. They are not the normal product path and their detailed algorithms are intentionally not documented as Pi-Codex behavior.

## Different from upstream Pi

Upstream Pi documentation describes token-threshold cut points, structured text summaries, direct message serialization, extension hooks, and generic `compaction.reserveTokens`/`keepRecentTokens` controls. Those remain implementation compatibility layers, but they are not how default Pi-Codex compaction works. Configure Responses Compaction V2 and its retention window instead.
