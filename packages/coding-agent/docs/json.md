# JSON Event Stream Mode

Use print mode with `--mode json` to receive JSON Lines events on stdout:

```sh
pi --mode json -p "Summarize this repository"
```

Each line is one JSON object. `message_start`, `message_update`, and `message_end` describe agent-session activity; errors are emitted as structured events. For assistant streaming, `message_update` sends the delta event rather than repeatedly serializing the whole assistant message. The final update includes usage when available.

JSON mode is intended for automation. Keep stdout exclusively for the event stream and send diagnostics to stderr. Use `--no-session` if the invocation should not persist a session.

The exported `JsonAgentSessionEvent` type in `src/modes/json-event.ts` is the wire-contract source of truth. Consumers should ignore fields they do not need so new metadata can be added compatibly.

## Pi-Codex constraints

The underlying event format is shared with Pi, but the launched runtime is Codex-only: authenticate through Pi-Codex, select one of the supported profiles, and expect Code/Notebook execution behavior in events and messages. Do not configure generic providers or direct stock tools through JSON mode.

## Different from upstream Pi

The JSONL framing and most event names are retained. Upstream provider/model and global-state examples are not Pi-Codex product configuration.
