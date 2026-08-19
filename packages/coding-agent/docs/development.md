# Development

Pi-Codex is maintained as a syncable fork of Pi. Keep permanent product policy narrow and localized; retain shared core foundations where possible.

## Workspace

The coding agent lives in `packages/coding-agent/`. Product-specific policy belongs close to `src/product/` and `src/extensions/pi-codex/`; generic Pi foundations remain in core packages.

Read repository `AGENTS.md` files before changing code. They define the contributor workflow and validation rules.

## Install and validate

Install dependencies without lifecycle scripts:

```sh
npm install --ignore-scripts
```

After code changes, run:

```sh
npm run check
```

Use focused tests while iterating. Run `./test.sh` for the full non-e2e gate once the change has converged. Do not run unrequested builds or the raw full Vitest suite.

## Product boundaries

Pi-Codex owns:

- OpenAI Codex provider/model policy;
- Code/Notebook composition and native prompt behavior;
- skills, custom tools, AGENTS loading, settings migration, cache/compaction, usage, and voice product behavior;
- user state under `~/.pi-codex/agent`.

Before adding a fork-specific workaround, check whether the shared core needs a small native hook instead. Keep upstream synchronization in mind and do not silently fall back from a product contract.

## Different from upstream Pi

Do not follow inherited development instructions that clone another repository, install a published generic package, build by default, or debug in `~/.pi/agent`. This checkout and its local `AGENTS.md` files are authoritative for Pi-Codex development.
