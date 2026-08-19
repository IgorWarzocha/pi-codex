# Skills

Skills are reusable instruction packages. Pi-Codex recognizes only canonical uppercase `SKILL.md`; arbitrary Markdown files are never inferred to be skills.

> Skills can direct the model to execute commands or use bundled assets. Review a skill before installing or trusting it.

## Roots

Pi-Codex discovers skills from these roots:

```text
~/.pi-codex/agent/skills/       # global
<cwd>/.pi/skills/               # trusted project root
<cwd-or-ancestor>/.agents/skills/  # trusted, up to Git root
```

Explicit settings, package, and CLI skill paths remain supported as advanced resource configuration. Global upstream roots such as `~/.pi/agent/skills/` and `~/.agents/skills/` are not Pi-Codex roots; copy wanted packages deliberately.

## Package shape

One directory level beneath a skills root is an **important** skill. Two levels means a **lazy categorized** skill:

```text
skills/
├── deploy/
│   └── SKILL.md                # important/eager: announced at session start
├── swe/
│   ├── hardening/
│   │   └── SKILL.md            # lazy: category "swe"
│   └── release/
│       └── SKILL.md            # lazy: category "swe"
└── creative/
    └── design/
        └── SKILL.md            # lazy: category "creative"
```

- Important skills are named in the initial system prompt and can be read on demand.
- Lazy skills are omitted from the initial prompt except for their category availability.
- Deeper `SKILL.md` files, scripts, references, and assets remain package contents; they are not separate discovered skills.
- Duplicate skill names are invalid. Pi-Codex reports every collision instead of silently choosing a root.

## Frontmatter

Use standard Agent Skills frontmatter with a non-empty `name` and `description`:

```md
---
name: release
description: Prepare and verify a Pi-Codex release.
---

# Release

Follow the repository release procedure exactly.
```

Keep paths to scripts, references, and assets relative to the skill package. Canonical `SKILL.md` is required even when another harness supports lower-case or arbitrary Markdown entry files.

## Use from the agent

Code and Notebook Mode compose skills through `exec`:

```ts
await tools.skills("list")
await tools.skills("list swe creative")
await tools.skills("read release")
await tools.skills("read deploy")
```

The read result includes the body and safe absolute paths for package content. Pi-Codex rescans before each new turn and each skills call. New important skills are announced to the current session as non-triggering developer messages; new lazy skills appear on the next list query.

## Migrate from Pi or another harness

Copy first, then review package depth and duplicate names:

```sh
mkdir -p ~/.pi-codex/agent/skills
cp -R ~/.pi/agent/skills/. ~/.pi-codex/agent/skills/
```

Keep broadly useful skills directly under `skills/`. Move specialist skills under one category. Do not copy into a destination containing same-named packages until you have compared and resolved them.

## Different from upstream Pi

Pi-Codex does not discover root `.md` files as skills, does not scan global `~/.agents/skills/`, and does not expose skills as `/skill:name` commands in its native Code/Notebook workflow. Upstream skill docs that tell the agent to use direct `read` are replaced by `tools.skills(...)` inside `exec`.
