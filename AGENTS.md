- Pi-Codex is a syncable Pi fork. Keep product policy narrow and local; do not delete shared-core capability merely to hide it from the shipped product.
- Answer Igor's questions before changing files. Be direct, concise, and technical; state agreement or disagreement before responding to feedback.
- Read a file in full before broad changes, audits, or editing an unfamiliar file. Ask before removing intentional behavior or overriding user-authored policy.
- TypeScript is strip-only in checked source. No inline imports, parameter properties, enums, namespaces, `import =`, or `export =`; dynamic imports need an explicit local lazy-boundary exception. Avoid `any`.
- Use configurable keybinding defaults, not hard-coded key checks. Do not edit `packages/ai/src/models.generated.ts`; change its generator then regenerate.

## Validation

- After code changes run `npm run check`; do not leave new diagnostics. Run a changed test file. Use `./test.sh` for the full non-e2e suite, never raw full Vitest.
- Do not run builds or tests the task does not require. Put ad-hoc scripts in `/tmp`, run them, then remove them.
- On `main`, add relevant entries only under each package's `Unreleased` changelog sections; released sections are immutable.

## Shared worktree and Git

- Other sessions may have changes. Stage explicit files only; never reset, clean, stash, add-all, or commit with `--no-verify`.
- Commit only on Igor's request. Before committing, inspect status and stage only this session's files; use `feat|fix|docs` with an optional package scope.
- Read `.github/AGENTS.md` for issues, PRs, and comments; `scripts/AGENTS.md` for releases; nearest package instructions for local rules.
