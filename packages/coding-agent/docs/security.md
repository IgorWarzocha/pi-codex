# Security and Project Trust

Pi-Codex can read files, run commands, modify repositories, load extensions, and use network-backed tools under your user account. It is not a sandbox.

## Project trust

Before loading project-local `.pi` resources, Pi-Codex asks whether to trust the project. A trusted project may load settings, extensions, packages, custom tools, prompts, themes, and project skills. Decisions are saved in:

```text
~/.pi-codex/agent/trust.json
```

Use `/trust` to save a decision, `--approve` to trust resources for one run, or `--no-approve` to ignore them. Trust a project only after reviewing its local configuration and dependencies.

Trust does not prevent an agent from changing files or executing shell commands once you ask it to work. It only controls automatic loading of project resources.

## Prompt injection

Repositories, issue text, web pages, tool output, skills, and generated files are untrusted input. They can contain instructions aimed at the model.

- Keep durable policy in your global or repository `AGENTS.md`.
- Ask the agent to explain unexpected instructions before acting on them.
- Review shell commands, destructive patches, credentials, and outbound network actions.
- Do not put secrets in prompts, session exports, skill files, or custom-tool definitions.
- Use Git and isolated worktrees or containers for risky repositories.

## Credentials and state

Pi-Codex stores its credentials and state separately under `~/.pi-codex/agent/`. Do not copy upstream Pi authentication wholesale. Limit access to that directory and avoid sharing session files without reviewing their contents.

Codex cache diagnostics store safe metadata only when enabled; nevertheless, treat logs and exports as potentially sensitive project records.

## Optional isolation

Use containers, VMs, separate users, or external tools such as Gondolin/OpenShell when the repository needs stronger boundaries. Those are external deployment choices, not a Pi-Codex security guarantee. Read [Containerization](containerization.md).

## Different from upstream Pi

The security model is inherited in spirit, but state paths and the executable product surface differ. Upstream provider credential guidance, direct stock tools, and `~/.pi/agent/trust.json` examples do not describe Pi-Codex.
