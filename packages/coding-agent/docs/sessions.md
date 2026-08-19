# Sessions

Pi-Codex saves sessions automatically as JSONL trees. The default location is:

```text
~/.pi-codex/agent/sessions/
```

Sessions are grouped by working directory. Use `PI_CODING_AGENT_SESSION_DIR`, `--session-dir`, or `sessionDir` to choose another location.

## Resume and manage

| Command or option | Use |
| --- | --- |
| `/resume`; `pi --resume` | Open the session picker. |
| `pi --continue` | Continue the latest session for the current project. |
| `pi --session <path-or-id>` | Resume a named path or partial session ID. |
| `pi --session-id <id>` | Use an exact project session ID, creating it when missing. |
| `/new` | Start a new session. |
| `/name <name>`; `--name <name>` | Set a display name. |
| `/session` | Show session metadata and statistics. |
| `/export [path]`; `--export <file>` | Export HTML by default, or JSONL when requested. |
| `/import <file>` | Import and resume a JSONL session. |

Session picker actions can resume, rename, delete, duplicate, export, or inspect the selected session.

## Tree navigation

`/tree` opens the conversation tree. A session has one active leaf; adding a user message from an earlier user entry creates a new branch.

- Select a **user message** to place its text in the editor, where you can edit and resubmit it as a branch.
- Select an **assistant, tool, compaction, or developer entry** to move the active leaf without adding text to the editor.
- Select the root user message to reset to an empty conversation with the original prompt in the editor.
- `/fork` creates a new branch from an earlier user message.
- `/clone` duplicates the current session at its current position.

`treeFilterMode` and the double-Escape action are configurable in Settings.

## Compaction and branch summaries

`/compact [prompt]` manually reduces current context. Automatic compaction runs when required by the Codex context budget. Pi-Codex defaults to OpenAI Responses Compaction V2 and replays the resulting checkpoint through the stable Codex session runtime.

When navigating or summarizing branches, Pi-Codex uses a hidden Codex summarization turn with the same stable session settings, then records the result as a visible, non-triggering developer summary. This lets the following turn reuse as much pre-summary cache state as possible. Read [Compaction](compaction.md).

## Format and portability

Session files are JSONL and preserve message entries, model/profile changes, labels, compactions, branch summaries, developer messages, and extension entries. Read [Session Format](session-format.md) before generating or editing them programmatically.

Pi-Codex does not share upstream Pi's session directory. Import JSONL deliberately rather than pointing both products at one live session tree.

## Different from upstream Pi

The tree and JSONL foundations come from Pi, but Pi-Codex branch summarization is cache-aware. Upstream descriptions of a standalone one-off branch-summary request with cache writes disabled do not describe the default Pi-Codex path.
