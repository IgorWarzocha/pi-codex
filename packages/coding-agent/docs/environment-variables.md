# Environment Variables

## Pi-Codex process configuration

| Variable | Meaning |
| --- | --- |
| `PI_CODEX_HOME` | Application home. Defaults to `~/.pi-codex`. |
| `PI_CODING_AGENT_DIR` | Agent directory; overrides `PI_CODEX_HOME`. |
| `PI_CODING_AGENT_SESSION_DIR` | Default session storage directory; `--session-dir` wins. |
| `PI_PACKAGE_DIR` | Override package directory for immutable/Nix-style installations. |
| `PI_OFFLINE` | Disable startup network operations when `1`, `true`, or `yes`. |
| `PI_TELEMETRY` | Override install telemetry when `1`/`true`/`yes` or `0`/`false`/`no`. |
| `PI_SHARE_VIEWER_URL` | Base viewer URL for `/share`. |
| `HTTP_PROXY`, `HTTPS_PROXY` | Proxy Pi-managed HTTP clients. |

Pi-Codex authentication is managed through `/login`. The supported product does not document generic provider API-key environment variables.

## Execution metadata

Shell commands launched by Pi retain process metadata that extensions and child processes can inspect. These markers identify the active coding-agent process, session, working directory, and execution context. They are implementation metadata, not a stable external API; prefer the extension API when writing an integration.

## Different from upstream Pi

`PI_CODEX_HOME` and the default `~/.pi-codex` home replace upstream Pi's global state path. The inherited CLI may still list broad provider-key variables for compatibility, but they are not Pi-Codex configuration.
