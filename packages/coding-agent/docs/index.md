# Pi-Codex Documentation

Pi-Codex is a TUI-first, OpenAI Codex subscription coding agent. It is a deliberate fork of Pi: it keeps Pi's session tree, extensions, themes, prompt templates, packages, project trust, JSON/RPC interfaces, and SDK foundations, while replacing the product provider, model catalog, system prompt, execution surface, skills, settings, compaction, cache behavior, and voice workflow.

Start with the [Pi-Codex Guide](pi-codex-guide.md). It covers first-run setup, migrating from Pi, the supported model profiles, skills, custom tools, and the status of inherited documentation.

## Quick start

```sh
pi
```

Then:

1. Run `/login` and authenticate with OpenAI Codex.
2. Run `/model` to choose Luna, Terra, or Sol, a 272K/472K/872K context window, and a reasoning level.
3. Run `/settings` to choose Code or Notebook Mode and review Codex, Voice, Usage, Display, Terminal, and Advanced settings.
4. Ask Pi-Codex to work. Code Mode uses `exec` and `wait`; native capabilities are composed with `tools.*` inside `exec`.

User state is separate from upstream Pi:

```text
~/.pi-codex/agent/    # Pi-Codex
~/.pi/agent/          # upstream Pi, not loaded as Pi-Codex state
```

Use `PI_CODEX_HOME` to relocate Pi-Codex's application home, or `PI_CODING_AGENT_DIR` to override the agent directory.

## Start here

- [Pi-Codex Guide](pi-codex-guide.md) — product differences, setup, and migration.
- [Quickstart](quickstart.md) — authenticate and start a first session.
- [Using Pi-Codex](usage.md) — interactive UI, commands, sessions, and CLI use.
- [Codex authentication and model profiles](providers.md) — the shipped provider and supported profiles.
- [Settings](settings.md) — global/project configuration and Pi-Codex settings.
- [Sessions](sessions.md) — session tree, branching, exports, and resume.
- [Compaction](compaction.md) — Responses Compaction V2 and cache-aware summaries.
- [Security](security.md) — project trust and safe use on real repositories.

## Customization

- [Skills](skills.md) — important and categorized `SKILL.md` packages.
- [Extensions](extensions.md) — advanced extension API and Pi-Codex compatibility.
- [Prompt Templates](prompt-templates.md) — reusable prompt expansions.
- [Themes](themes.md) — TUI themes.
- [Pi Packages](packages.md) — reviewed distribution of extensions and resources.
- [Code Mode Custom Tools](custom-tools.md) — native deferred custom tools.
- [Codex model profiles](models.md) — the supported model/context/reasoning matrix.
- [Custom providers](custom-provider.md) — retained generic API, not a supported Pi-Codex product path.

## Interfaces and reference

- [Session Format](session-format.md) — JSONL session format.
- [SDK](sdk.md) — programmatic use of the retained core.
- [RPC Mode](rpc.md) and [JSON Event Stream Mode](json.md) — machine interfaces.
- [TUI Components](tui.md) — reusable terminal UI package.
- [Environment Variables](environment-variables.md) — process configuration and execution metadata.

## Platform and development

- [Terminal Setup](terminal-setup.md), [tmux](tmux.md), [Windows](windows.md), [Termux](termux.md), and [Shell Aliases](shell-aliases.md).
- [Containerization](containerization.md) — optional external isolation patterns.
- [Development](development.md) — contributor workflow for this fork.

## Different from upstream Pi

Pi-Codex does not ship a general provider catalog, API-key setup, Ollama/llama.cpp integration, or Normal Mode. Upstream documentation and extensions that assume top-level `read`, `bash`, `edit`, `write`, `grep`, `find`, or `ls` need adaptation: Code and Notebook Mode expose `exec`, `wait`, and, in Notebook Mode, `notebook`, with nested capabilities under `tools.*`.

The retained generic SDK and extension APIs can expose broader concepts internally. Their presence does not expand the supported Pi-Codex CLI product surface.
