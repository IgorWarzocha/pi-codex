# RPC Mode

Run `pi --mode rpc` to control a headless Pi-Codex session over JSON Lines. Send one command per stdin line; stdout emits responses and agent events.

```sh
pi --mode rpc
```

```json
{"id":"1","type":"prompt","message":"Explain this repository"}
{"id":"2","type":"get_state"}
```

Each accepted command receives a response with the matching optional `id`. Prompting then produces asynchronous session events.

## Command groups

| Group | Commands |
| --- | --- |
| Prompting | `prompt`, `steer`, `follow_up`, `abort`, `new_session` |
| State | `get_state` |
| Model/reasoning | `set_model`, `cycle_model`, `get_available_models`, `set_thinking_level`, `cycle_thinking_level`, `get_available_thinking_levels` |
| Queue | `set_steering_mode`, `set_follow_up_mode` |
| Context | `compact`, `set_auto_compaction`, `set_auto_retry`, `abort_retry` |
| Shell | `bash`, `abort_bash` |
| Session | `get_session_stats`, `export_html`, `switch_session`, `fork`, `clone`, `get_fork_messages`, `get_entries`, `get_tree`, `get_last_assistant_text`, `set_session_name` |
| Discovery | `get_messages`, `get_commands` |

`bash` accepts `excludeFromContext` when output must not become model context. It is a host/client operation, not a claim that Code Mode exposes a top-level agent Bash tool.

The exact request, response, event, and extension-UI unions live in `src/modes/rpc/rpc-types.ts`. Generate client bindings from those exported types rather than duplicating this summary.

## Pi-Codex constraints

RPC shares the core protocol but launches Pi-Codex product policy: OpenAI Codex authentication, Luna/Terra/Sol profiles, separate `~/.pi-codex/agent` state, and Code/Notebook agent execution. Clients should offer only supported provider/model choices even though generic RPC fields remain in the shared protocol.

## Different from upstream Pi

RPC is retained for compatibility and automation; it does not turn the fork into a multi-provider direct-tool client. Upstream examples using arbitrary provider IDs or stock agent tools are unsupported Pi-Codex workflows.
