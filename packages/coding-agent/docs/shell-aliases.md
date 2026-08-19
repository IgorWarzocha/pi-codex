# Shell Aliases

Pi-Codex starts shell commands non-interactively, so interactive shell aliases are usually unavailable. Set `shellCommandPrefix` in `~/.pi-codex/agent/settings.json` when a project deliberately requires shell setup before every agent command:

```json
{
  "shellCommandPrefix": "source ~/.zshrc"
}
```

The prefix is arbitrary shell code run before every agent shell command. Keep it small, deterministic, and free of prompts, network calls, or side effects. A dedicated helper script is usually safer than loading an entire interactive configuration.

## Different from upstream Pi

The setting is retained, but Pi-Codex user settings live under `~/.pi-codex/agent/`. Code/Notebook Mode composes shell work through `tools.exec_command(...)` inside `exec`; do not write instructions assuming a top-level `bash` tool.
