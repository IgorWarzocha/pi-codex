# Pi Packages

Pi packages distribute reviewed extensions, skills, prompt templates, and themes. Pi-Codex keeps the package mechanism, but packages do not expand the supported Codex provider/model product surface.

## Install and manage

```sh
pi install <npm-package-or-git-source>
pi list
pi update <source>
pi remove <source>
pi config
```

`pi config` opens package-resource controls. Packages can also be declared in `packages` in global `~/.pi-codex/agent/settings.json` or trusted project `.pi/settings.json`.

Packages execute or load code according to the resources they contain. Review sources and dependencies before installation. Project packages require trust.

## Package resources

A package can contain:

- extensions;
- `skills/` packages;
- `prompts/` Markdown templates;
- `themes/` JSON themes;
- optional resource filters in `pi` package metadata or `packages` settings.

Use a package when resources should be versioned and shared. Use a local resource directory for project-specific configuration.

## Pi-Codex compatibility

Before installing an upstream Pi package, inspect it for:

- hard-coded `~/.pi/agent` paths;
- broad provider/model configuration or API-key assumptions;
- Normal Mode or top-level direct-tool instructions;
- obsolete `@howaboua/pi-codex-conversion` setup;
- skill packages that do not use canonical `SKILL.md` or the Pi-Codex important/lazy layout.

Adapt the package or keep it on upstream Pi when those assumptions are essential.

## Different from upstream Pi

Package installation is retained, but Pi-Codex is not a general package ecosystem that promises every upstream provider or tool package works unchanged. Packages distribute compatible resources; they do not override the fork's Codex-only provider policy.
