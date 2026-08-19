# Session Format

Pi-Codex sessions are JSONL files. The first line is a session header; each following line is a tree entry with an `id`, `parentId`, and timestamp. The current format version is 3.

Default storage is `~/.pi-codex/agent/sessions/`. Treat files as append-oriented records. Use `/export`, `/import`, or the session APIs instead of editing active files by hand.

## Header

```json
{
  "type": "session",
  "version": 3,
  "id": "019...",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "cwd": "/work/project"
}
```

`parentSession` is present when a session was created from another session.

## Entries

Every entry has `type`, `id`, `parentId`, and `timestamp`. Current entry types are:

| Type | Important fields |
| --- | --- |
| `message` | `message`: an agent/user/tool/developer message. |
| `thinking_level_change` | `thinkingLevel`. |
| `model_change` | `provider`, `modelId`, optional `contextWindow`. |
| `compaction` | `summary`, `firstKeptEntryId`, `tokensBefore`, optional `details`, `usage`, `fromHook`. |
| `branch_summary` | `fromId`, `summary`, optional `details`, `usage`, `fromHook`. |
| `custom` | extension `customType` and `data`; excluded from model context. |
| `custom_message` | model-visible extension `content`, `customType`, `details`, and `display`. |
| `label` | `targetId` and `label`. |
| `session_info` | session `name`. |

`custom_message.display` controls TUI rendering. Its content remains model-visible as a developer message regardless of display; use `custom` for extension state that must stay out of agent context.

## Compatibility

Pi-Codex reads older session data where supported, but writes version 3. Exported sessions may contain fork-specific developer messages, Codex compaction state, Code/Notebook tool results, and extension entries. Import data only from sources you trust.

The TypeScript source of truth is `src/core/session-manager.ts`; use its exported types when building an integration.

## Different from upstream Pi

The tree format is retained, but Pi-Codex stores state in a separate directory and uses cache-aware Codex compaction and developer updates. Historical upstream examples that describe unknown checkpoint fields or a different default location are not authoritative.
