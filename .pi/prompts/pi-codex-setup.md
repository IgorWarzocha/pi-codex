---
description: Build this checkout and install pi-codex on the local PATH
---
Set up this Pi-Codex checkout as my local `pi-codex` command. Do the work now; do not merely describe the steps.

## Outcome

I should be able to open a new shell and run `pi-codex` from `PATH`. It must execute an artifact built from this checkout, not an npm-published package or another Pi installation.

## Method

1. Read the applicable `AGENTS.md` files, then inspect the host platform, shell, current `PATH`, this worktree, and its supported local build entry points.
2. Choose the smallest correct installation method for this host. Prefer the appropriate native local build when its prerequisites are present; otherwise use the repository's supported local Node path. Account for every runtime asset the chosen artifact needs.
3. Build from this checkout. Install dependencies with lifecycle scripts disabled when installation is needed. Do not disturb existing worktree changes, clean the repository, or replace an unrelated existing `pi-codex` command without explaining the conflict first.
4. Make the local build reachable as exactly `pi-codex` in the user's normal shell `PATH`. Choose the right user-local directory and mechanism for this host. Do not create a generic setup script or assume a fixed shell layout.
5. Verify the command resolves to this checkout's build and run at least `pi-codex --version` and `pi-codex --help`. Confirm that Pi-Codex state remains separate under its normal `~/.pi-codex` home unless the user has deliberately overridden it.
6. Report the installed command target, the build method, and the exact minimal command needed to refresh the local build after this checkout changes.
7. End your final response with this exact next step, after reporting successful verification:

   ```text
   Run `pi-codex` from a project directory, then enter `/pi-codex-guide` to let Pi-Codex walk you through setup and migration.
   ```

## Constraints

- Do not publish to npm, run `npm install -g`, or make this setup depend on a registry release.
- Do not use `sudo` without asking. Ask only when a path conflict, missing required prerequisite, or permission boundary prevents a safe user-local setup.
- Treat the platform-specific solution as part of the task: inspect first, then implement the least surprising local arrangement.
