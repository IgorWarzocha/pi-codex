# Windows

Pi-Codex needs a POSIX-compatible shell for agent shell work. WSL is the simplest route. On native Windows, install Git Bash or another Bash-compatible shell and configure it when automatic detection chooses the wrong executable:

```json
{
  "shellPath": "C:\\Program Files\\Git\\bin\\bash.exe"
}
```

Save this in `~/.pi-codex/agent/settings.json`, then restart or reload the session. Paths support leading `~` where relevant.

Use Windows Terminal or another modern terminal with Unicode and truecolor support. For modified keyboard shortcuts, read [Terminal Setup](terminal-setup.md).

## Different from upstream Pi

Shell resolution is retained, but the global settings directory is Pi-Codex-specific. Pi-Codex uses Code/Notebook composition rather than advertising a direct top-level Bash tool.
