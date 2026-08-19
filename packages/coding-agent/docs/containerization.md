# Containerization

Pi-Codex runs with the permissions of its host user. Use a container, VM, separate account, or dedicated worktree when a repository needs stronger isolation.

## What to isolate

Mount only the repository and credentials the task needs. Consider separate writable and read-only mounts, a disposable home directory, restricted network access, and a minimal shell/toolchain image.

Pi-Codex state normally lives in `~/.pi-codex/agent/`. In a container, mount a dedicated state directory or set `PI_CODEX_HOME`/`PI_CODING_AGENT_DIR`; do not casually mount your upstream Pi state or host credential directory.

## Codex authentication

Authenticate inside the environment with `/login`, or deliberately provision the isolated Pi-Codex state. Treat copied authentication files as sensitive. Session exports, cache diagnostics, and project mounts may also contain source-sensitive data.

## External sandbox integrations

Gondolin and OpenShell-style integrations are optional external patterns. They are not built-in Pi-Codex guarantees and may need adaptation for Code/Notebook Mode and `tools.*`. Review their current documentation, network behavior, and credentials before enabling them.

## Different from upstream Pi

The isolation principles are the same, but upstream image, provider, `~/.pi/agent`, and direct-tool examples do not describe the Pi-Codex product. Pi-Codex supports the OpenAI Codex subscription runtime only.
