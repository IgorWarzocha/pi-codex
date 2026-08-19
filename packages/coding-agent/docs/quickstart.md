# Pi-Codex Quickstart

Pi-Codex is a Codex-subscription coding agent. Start it in the repository you want to work on:

```sh
cd ~/Work/my-project
pi
```

## Authenticate

Run `/login`, choose OpenAI Codex, and complete the subscription sign-in flow. Pi-Codex stores its credentials separately from upstream Pi under `~/.pi-codex/agent/`.

If Pi-Codex offers to migrate settings from Pi, it copies compatible appearance, terminal, editor, and input preferences only. Authentication, sessions, model choices, packages, and extensions remain separate.

## Choose a profile

Run `/model` to select three independent parts of the Codex profile:

1. **Model:** Luna, Terra, or Sol.
2. **Context window:** 272K, 472K, or 872K.
3. **Reasoning:** low, medium, high, xhigh, or max when supported by the selected profile.

Luna is the default. `/scoped-models` controls the saved profiles available to model cycling; it is not a general provider catalog.

## Start a first session

Ask for a concrete task:

```text
Read the repository instructions, explain the architecture, then fix the failing test.
```

Pi-Codex starts in **Code Mode**. The agent receives `exec` and `wait`, then composes native capabilities inside `exec` through `tools.*`: shell commands, patches, image inspection, web research, generated images, and skills. **Notebook Mode** adds a persistent Deno/TypeScript notebook through the `notebook` tool.

The agent may modify your working tree. Use Git or another checkpointing workflow before work you may want to undo.

## Give it instructions

Put durable repository instructions in `AGENTS.md` at the project root:

```md
# Project instructions

- Run the focused test before the full gate.
- Do not change generated files directly.
- Use the existing formatter.
```

At startup, Pi-Codex loads:

- `~/.pi-codex/agent/AGENTS.md` for global instructions.
- `<cwd>/AGENTS.md` for the current project.

When the agent enters a deeper repository scope, native path-aware reads can discover a more-specific nested `AGENTS.md`. Keep nested instructions local to the directory they govern.

## Add skills

Global skills live in `~/.pi-codex/agent/skills/`. Project skills live in trusted `<cwd>/.pi/skills/` or `.agents/skills/` roots between the working directory and Git root.

```text
~/.pi-codex/agent/skills/
├── deploy/
│   └── SKILL.md             # important: announced initially
└── swe/
    └── release/
        └── SKILL.md         # lazy: available in category "swe"
```

Pi-Codex recognizes only canonical uppercase `SKILL.md`. Ask the agent to use `tools.skills("list")` or `tools.skills("read release")` inside `exec`. See [Skills](skills.md).

## Continue later

Sessions save automatically under `~/.pi-codex/agent/sessions/`:

```sh
pi --continue
pi --resume
pi --session <path-or-id>
```

Use `/tree` to navigate branches, `/fork` to create a branch from an earlier user message, and `/clone` to duplicate the current position.

## One-shot use

Use print mode for one request that exits afterwards:

```sh
pi -p "Explain the structure of this repository"
git diff --stat | pi -p "Review this diff for regressions"
```

## Next steps

- [Pi-Codex Guide](pi-codex-guide.md) for migration and all fork differences.
- [Using Pi-Codex](usage.md) for commands and CLI use.
- [Settings](settings.md) for execution, cache, compaction, voice, and display options.
- [Security](security.md) before loading untrusted project resources.

## Different from upstream Pi

Pi-Codex has no Normal Mode and does not present top-level `read`, `bash`, `edit`, `write`, `grep`, `find`, or `ls` as its product tools. It does not configure Anthropic, Google, OpenRouter, local models, or API keys. Existing upstream instructions that rely on those surfaces need adaptation to Code/Notebook composition and OpenAI Codex authentication.
