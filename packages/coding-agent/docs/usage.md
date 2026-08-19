# Using Pi-Codex

## Interactive mode

Run `pi` from a project directory. The TUI has a transcript, input editor, status line, and footer. `/settings` can temporarily replace the editor with its tabbed settings UI.

### Editor and queue

| Input | Result |
| --- | --- |
| `/` | Open slash-command completion. |
| `@` | Search and attach project files. |
| `!command` | Run a shell command and send its output to the model. |
| `!!command` | Run a shell command without adding its output to model context. |
| Ctrl+G | Open the external editor from `externalEditor`, `$VISUAL`, `$EDITOR`, or the platform default. |
| Escape | Abort the running turn and restore queued messages to the editor. |
| Alt+Up | Retrieve a queued message into the editor. |

While a turn is running, Enter queues steering; the configured follow-up key queues work for after the turn. `/settings` controls whether queued messages are delivered all at once or one at a time.

### Pi-Codex commands

| Command | Use |
| --- | --- |
| `/login`, `/logout` | Authenticate or clear OpenAI Codex credentials. |
| `/model` | Choose model, context window, and reasoning. |
| `/scoped-models` | Manage saved model profiles for cycling. |
| `/settings` | Open tabbed Pi-Codex settings. |
| `/usage [refresh\|reset]` | Show Codex limits or consume a banked reset. |
| `/voice [realtime\|dictation\|mute\|stop\|server\|setup]` | Control realtime voice, dictation, and LAN voice. |
| `/pi-codex-guide [topic]` | Ask the agent to read the fork guide and explain setup or migration. |
| `/compact [prompt]` | Compact the session context. |
| `/tree`, `/fork`, `/clone` | Navigate or create session branches. |
| `/resume`, `/new`, `/name`, `/session` | Resume, create, name, or inspect sessions. |
| `/export [path]`, `/import <path>` | Export HTML/JSONL or import a JSONL session. |
| `/trust` | Save a project trust decision for future sessions. |
| `/reload` | Reload keybindings, extensions, skills, prompts, themes, and context files. |

`/hotkeys` lists current keybindings and `/changelog` shows release notes. Extensions and prompt templates can add commands.

## Execution modes

**Code Mode** is the default. It gives the model `exec` and `wait`; code in `exec` composes built-in capabilities through `tools.*`.

**Notebook Mode** adds `notebook`, which manages a persistent Deno/TypeScript kernel. Use it for stateful analysis and reusable computation. Choose the mode in `/settings`; it changes the native prompt and active top-level tools.

The stable prompt and tool order are deliberate: they help preserve OpenAI prompt-cache continuity.

## Instructions, skills, and trust

At startup Pi-Codex loads global `~/.pi-codex/agent/AGENTS.md` and `<cwd>/AGENTS.md`. More-specific nested instructions are discovered when the agent works in deeper paths.

Project-local `.pi` resources, including settings, custom tools, extensions, and skills, need a saved or per-run trust decision. Use `/trust`, `--approve`, or `--no-approve`. Trust is permission to load project resources; it is not a sandbox. Read [Security](security.md).

Skills use canonical `SKILL.md` packages and are available inside `exec` through `tools.skills(...)`. Read [Skills](skills.md).

## Sessions

Sessions save automatically to `~/.pi-codex/agent/sessions/`, organized by working directory. Use `--continue`, `--resume`, `--session`, `--session-id`, `--fork`, `--session-dir`, `--name`, or `--no-session` from the CLI. Read [Sessions](sessions.md).

Use `/export` to write HTML or JSONL. `/share` can create a secret GitHub gist when configured.

## CLI

```text
pi [options] [@files...] [messages...]
```

Useful Pi-Codex options:

| Option | Use |
| --- | --- |
| `-p`, `--print` | Process a prompt and exit. Piped stdin is added to the initial prompt. |
| `-c`, `--continue`; `-r`, `--resume` | Continue the latest session or choose a session. |
| `--session`, `--session-id`, `--fork`, `--session-dir`, `--no-session`, `--name` | Select and manage session storage. |
| `--model`, `--thinking`, `--models` | Select a supported Codex profile or saved cycling set. |
| `--offline` | Disable startup network operations. |
| `--tui-mode regular\|fullscreen` | Choose terminal-owned scrollback or application-owned fullscreen scrolling. |
| `--approve`, `--no-approve` | Trust or ignore project-local resources for this invocation. |
| `--extension`, `--skill`, `--prompt-template`, `--theme` | Add an explicit local resource. |
| `--no-extensions`, `--no-skills`, `--no-prompt-templates`, `--no-themes`, `--no-context-files` | Disable a discovered resource class. |
| `--mode text\|json\|rpc` | Choose interactive/text, JSON event stream, or RPC mode. |

Examples:

```sh
pi "Read AGENTS.md and explain this project"
pi -p "Summarize the changes in this repository"
git diff | pi -p "Review this patch for regressions"
pi --continue "Continue the implementation"
pi --model gpt-5.6-terra --thinking high "Investigate the failure"
pi --export ~/.pi-codex/agent/sessions/--path--/session.jsonl
```

File arguments beginning with `@` become attachments to the initial message. The `--mode json` and `--mode rpc` interfaces are documented in [JSON Event Stream Mode](json.md) and [RPC Mode](rpc.md).

## Different from upstream Pi

Some inherited CLI flags remain accepted by shared internals, including generic `--provider`, API-key, direct-tool, and models-catalog options. They are compatibility surface, not supported Pi-Codex workflows. Pi-Codex documentation does not promise their behavior. Use `/login`, `/model`, Code/Notebook Mode, and the supported Codex profiles instead.
