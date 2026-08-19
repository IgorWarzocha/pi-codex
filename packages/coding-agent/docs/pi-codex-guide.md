# Pi-Codex Guide

Pi-Codex is an opinionated, TUI-first fork of Pi for the OpenAI Codex subscription runtime. It keeps Pi's sessions, extensions, themes, prompt templates, project trust, JSON/RPC interfaces, and much of its SDK, but changes the provider, model, prompt, tool, skill, settings, compaction, and voice experience.

This document is the starting point for setup and migration. The documentation set has been rewritten around the Pi-Codex product. Each affected page preserves a compact **Different from upstream Pi** section so a user or agent can identify deliberately removed compatibility surfaces. When documentation and current source disagree, current source is authoritative.

## Different from upstream Pi

This guide is the fork's migration map. It deliberately calls out removed general-provider, Normal Mode, and direct-tool assumptions instead of presenting compatibility internals as supported product features. The remainder of the documentation follows the same rule.

## Product differences

| Area | Upstream Pi | Pi-Codex |
| --- | --- | --- |
| Product scope | General multi-provider coding agent | OpenAI Codex subscription-focused fork |
| Built-in provider | Many providers | `openai-codex` only |
| Built-in models | Broad provider catalogs | `gpt-5.6-luna`, `gpt-5.6-terra`, and `gpt-5.6-sol` |
| Model selection | Provider/model list | Three-column model, context-window, and reasoning profile selector |
| Default tools | Direct `read`, `bash`, `edit`, and `write` style tools | Code Mode `exec` and `wait`, with native tools composed inside `exec` |
| Execution modes | Standard direct tools | Code Mode and Notebook Mode; Normal Mode is removed |
| User state | `~/.pi/agent/` | `~/.pi-codex/agent/` |
| System prompt | Stock Pi prompt assembled around direct tools | Native heavy Pi-Codex prompt for Code/Notebook Mode |
| Skills | Eager skill descriptions and file reads | Eager important skills plus categorized lazy skills through the native `skills` tool |
| Compaction | Pi summary compaction | OpenAI Responses Compaction V2 and replay by default, with Pi fallback paths retained |
| Voice | Extension-dependent | Native realtime voice, dictation, context delegation, and LAN control |
| Usage | Provider-generic token/cost information | Codex subscription limits and reset credits through `/usage` and Settings |

## First-run setup

1. Start Pi-Codex in a terminal.
2. Authenticate with `/login` and select OpenAI Codex subscription authentication.
3. Open `/model` and choose:
   - Luna, Terra, or Sol
   - 272K, 472K, or 872K context
   - low, medium, high, xhigh, or max reasoning
4. Open `/settings` to choose Code or Notebook Mode and review Codex, Voice, Usage, Display, Terminal, and Advanced settings.
5. If Pi-Codex offers to import existing Pi settings, choose whether to import compatible UI and terminal preferences.

Luna is the default model. Saved model profiles are user-selected combinations for model cycling; they are not an expanded provider catalog. CLI model selection and restored sessions fall back to the supported Pi-Codex model set.

## Separate state and migration

Pi-Codex deliberately does not share live state with upstream Pi.

```text
~/.pi/agent/          # upstream Pi
~/.pi-codex/agent/    # Pi-Codex
```

`PI_CODEX_HOME` changes the Pi-Codex application home. `PI_CODING_AGENT_DIR` can override the agent directory directly.

The one-time settings importer copies only compatible provider-independent preferences, such as built-in themes, editor/input behavior, terminal display, image rendering, Markdown rendering, and session-navigation presentation. It does not copy authentication, sessions, model choices, extensions, packages, or Pi-Codex settings.

Do not copy `settings.json` wholesale. Provider and tool assumptions differ. Migrate resources separately and review extensions before enabling them.

### Suggested migration order

1. Import or recreate appearance and terminal preferences.
2. Authenticate Pi-Codex independently.
3. Copy and organize skills.
4. Copy prompt templates and themes that you still use.
5. Review extensions one at a time for direct-tool or provider assumptions.
6. Recreate custom tools using Pi-Codex's native Code Mode custom-tool format where appropriate.
7. Leave upstream sessions and authentication in the upstream Pi directory.

## Skills

Pi-Codex recognizes only canonical `SKILL.md` files. Other Markdown files are package contents, not independently discovered skills.

### Global skills

The default global root is:

```text
~/.pi-codex/agent/skills/
```

Upstream `~/.pi/agent/skills/` and global `~/.agents/skills/` are not loaded as Pi-Codex global roots. Copy wanted skills into the Pi-Codex root deliberately.

### Project skills

Pi-Codex also loads trusted project skills from:

```text
<cwd>/.pi/skills/
<cwd-or-ancestor>/.agents/skills/
```

`.agents/skills` roots are scanned from the current directory toward the Git repository root. Project-local resources remain subject to project trust.

### Important and categorized skills

The directory depth determines how a skill is exposed:

```text
skills/
├── deploy/
│   └── SKILL.md              # important/eager skill
├── swe/
│   ├── hardening/
│   │   └── SKILL.md          # lazy skill in category "swe"
│   └── release/
│       └── SKILL.md          # lazy skill in category "swe"
└── creative/
    └── design/
        └── SKILL.md          # lazy skill in category "creative"
```

- `<root>/<skill>/SKILL.md` is important. Its name and description appear in the initial system prompt.
- `<root>/<category>/<skill>/SKILL.md` is lazy. Only the category is announced initially.
- Deeper `SKILL.md` files are package contents and are not discovered as additional skills.
- Duplicate skill names are invalid and reported rather than silently shadowed.

The agent reads skills through the native composed tool:

```ts
await tools.skills("list")
await tools.skills("list swe creative")
await tools.skills("read hardening")
await tools.skills("read deploy")
```

Pi-Codex rescans before turns and skill-tool calls. A newly added important skill is announced to the current session with a non-triggering developer message. Categorized additions appear on the next list query.

### Copying existing skills

For a direct migration, first copy skills without changing their package contents:

```sh
mkdir -p ~/.pi-codex/agent/skills
cp -R ~/.pi/agent/skills/. ~/.pi-codex/agent/skills/
```

Then review the resulting depth:

- Keep frequently needed, broad workflow skills directly beneath `skills/`.
- Move specialist skills under one category directory to keep the initial prompt stable.
- Keep each skill's scripts, references, and assets inside its package directory.
- Check that every package uses uppercase canonical `SKILL.md` and valid frontmatter.

Do not run the copy command if the destination already contains skills with the same names. Compare first and resolve collisions explicitly.

## Execution modes and tools

### Code Mode

Code Mode is the default. The model sees two top-level tools:

- `exec`: run an isolated JavaScript composition cell
- `wait`: resume or terminate a yielded cell

Native and custom tools are called inside `exec`, normally through `tools.*`. Core nested capabilities include shell execution, process continuation, patching, image viewing, web search, image generation, and skills.

The stock Pi direct tools are not part of the Pi-Codex product surface. Guidance or extensions that assume top-level `read`, `bash`, `edit`, `write`, `grep`, `find`, or `ls` need adaptation.

### Notebook Mode

Notebook Mode adds a persistent Deno/TypeScript kernel and the top-level `notebook` lifecycle tool. It retains variables and selected reusable state across cells, supports checkpoints and named profiles, and still delegates native Pi capabilities through `tools.*`.

Use Code Mode for isolated composition. Use Notebook Mode when persistent computation, data, or reusable helpers materially help the task.

## Native custom tools

Code and Notebook Mode discover TOML custom tools from:

```text
~/.pi-codex/agent/custom-tools/*.toml
<cwd>/.pi/custom-tools/*.toml
```

Custom tools are deferred by default, so the model can discover or promote them without bloating the stable initial prompt. Set `defer_loading = false` for tools that should be available immediately. Newly registered non-deferred tools are announced to the current session with a non-triggering developer message and are included normally in future sessions.

Read `custom-tools.md` for the format, validation, trust, execution, and output contracts.

## Instructions and system prompt

Pi-Codex builds its heavy Code/Notebook prompt natively. It does not construct the stock Pi prompt and then rewrite it in `before_agent_start`.

At startup it loads:

- global `~/.pi-codex/agent/AGENTS.md`, when present
- `AGENTS.md` directly in the current working directory, when present

It does not walk every ordinary parent directory up to the home directory. While working, native path-aware tool execution can discover more-specific nested `AGENTS.md` files when the agent enters or reads a deeper repository scope.

Extensions can still use Pi lifecycle hooks. User-facing custom boxes remain excluded from model context unless their extension deliberately supplies model-visible content. Model-visible developer messages are preserved as developer messages and can update a running session without triggering a turn.

## Settings, usage, and voice

`/settings` is organized around the fork rather than exposing a flat upstream list. Important Pi-Codex controls include:

- Code or Notebook execution mode
- response verbosity and fast service tier
- Responses Compaction V2 and retained user-message window
- cache diagnostics, cached WebSockets, and cache keepalive
- helper model and text image descriptions
- realtime voice, dictation, voice context model, and reasoning
- status line and background shell widget
- Codex subscription usage and reset credits

`/usage` opens Codex usage information directly. Cache continuity is a first-class design constraint: Pi-Codex keeps prompts, ordered tools, request settings, and compaction replay stable where possible. The OpenAI Codex prompt-cache lifetime is treated as 30 minutes; the optional keepalive refreshes before expiry.

Realtime voice session start and end updates are model-visible developer messages that do not start their own turns. Voice context delegation can use the supported Luna, Terra, or Sol models.

## Sessions and retained Pi features

Pi-Codex keeps Pi's session tree, branching, resume/continue flows, labels, exports, custom extensions, prompt templates, themes, package manager, project trust, JSON output, RPC mode, and much of the SDK surface.

Tree summarization is adapted for the Codex cache model: it uses a hidden summarization turn with stable session settings, then records the result as a visible, non-triggering developer summary before continuing from the stable history prefix.

These inherited systems remain useful, but examples that select non-Codex providers or invoke stock direct tools do not describe the fork's default product behavior.

## Documentation map

All shipped Markdown documentation is available alongside this guide in installed package and binary `docs/` directories.

- Start with `quickstart.md`, `usage.md`, `settings.md`, `providers.md`, and `models.md` for the product.
- Use `skills.md`, `custom-tools.md`, `extensions.md`, `packages.md`, `prompt-templates.md`, and `themes.md` for customization.
- Use `sessions.md`, `compaction.md`, `session-format.md`, `json.md`, `rpc.md`, and `sdk.md` for session and integration work.
- Use `security.md`, `containerization.md`, `terminal-setup.md`, `tmux.md`, `windows.md`, `termux.md`, and `shell-aliases.md` for operating context.

`custom-provider.md` and `llama-cpp.md` are intentionally short unsupported-feature references. They explain what upstream Pi offered and confirm that Pi-Codex does not ship it. The generic shared core may still contain compatibility primitives; this does not make them supported Pi-Codex configuration.

## Troubleshooting checklist

When Pi-Codex behaves like an unconfigured or upstream Pi installation, check:

1. The active state path is `~/.pi-codex/agent`, or the intended override.
2. OpenAI Codex authentication was completed inside Pi-Codex.
3. The selected model is Luna, Terra, or Sol.
4. The selected execution mode is Code or Notebook.
5. Skills are under a recognized Pi-Codex or project root and use canonical `SKILL.md`.
6. Skill depth matches the intended important or categorized behavior.
7. Extensions do not assume removed direct tools or non-Codex providers.
8. Project-local resources are trusted.
9. Inherited documentation examples have been checked against this guide or current source.

Use `/pi-codex-guide <topic>` at any time to ask the current agent to read this guide and walk through a specific setup or migration area.
