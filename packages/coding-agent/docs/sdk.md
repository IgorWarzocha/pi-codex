# SDK

The coding-agent package exposes retained Pi primitives for embedding sessions, building extensions, and creating custom UIs. The shipped CLI applies Pi-Codex product policy on top: OpenAI Codex only, supported Luna/Terra/Sol profiles, Code/Notebook Mode, and separate user state.

## Start from the source types

The SDK is TypeScript-first. Its current contracts are exported from:

- `src/core/sdk.ts` — session and runtime composition;
- `src/core/agent-session.ts` — live agent session behavior and events;
- `src/core/session-manager.ts` — JSONL sessions and tree operations;
- `src/core/extensions/types.ts` — extension API;
- `src/modes/rpc/rpc-types.ts` — RPC wire protocol;
- `src/tools/runtime.ts` — Pi-Codex Code/Notebook top-level tools.

Use the installed package declarations or these source files as the API authority. The generic SDK evolves with upstream Pi; this page documents the supported product boundary rather than freezing every internal interface.

## Embed a session

An embedded application normally creates a settings manager, resource loader, model runtime, session manager, and agent session through the SDK composition helpers. Reuse the Pi-Codex product runtime rather than assembling a broad provider list yourself. Keep the application’s user state rooted in `PI_CODEX_HOME` or an explicit agent directory.

Subscribe to agent-session events to render messages, tool activity, compaction, retries, and completion. Persist session tree changes through `SessionManager`; do not construct JSONL rows manually while a session is active.

## Build extensions first

For most customization, an extension is safer than embedding the full runtime. Extensions receive lifecycle events, register commands/UI, and can add model-visible developer messages without reimplementing session orchestration. Read [Extensions](extensions.md).

For a process boundary, use [RPC Mode](rpc.md) or [JSON Event Stream Mode](json.md) rather than reaching into internals.

## Product invariants

An embedding that claims Pi-Codex behavior should preserve:

- `openai-codex` and the supported product model catalog;
- native Code/Notebook prompt and tool composition;
- ordered stable prompts/tools for cache continuity;
- Responses Compaction V2 defaults and cache-aware branch summaries;
- Pi-Codex paths, trust handling, and resource loading;
- developer messages that can update context without starting a turn.

## Different from upstream Pi

The underlying SDK still allows generic model runtimes and provider-shaped types. Those primitives exist for shared-core compatibility, not as an invitation to expose arbitrary providers in a Pi-Codex embedding. Upstream examples with `~/.pi/agent`, API keys, or direct agent tools need explicit adaptation.
