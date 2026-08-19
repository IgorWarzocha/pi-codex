# Pi-Codex

<p align="center">
  <img src="packages/coding-agent/src/modes/interactive/assets/pi-codex-duo.png" alt="Pixel-art Pi and Codex characters pointing at each other" width="384">
</p>

This repository is a fork of Pi focused on an opinionated OpenAI Codex TUI. The product is Pi-Codex: Code/Notebook execution, native Codex prompts and cache handling, Responses Compaction V2, voice, skills, custom tools, and a constrained Luna/Terra/Sol model surface.

The coding agent is in [`packages/coding-agent`](packages/coding-agent). Start with its [Pi-Codex Guide](packages/coding-agent/docs/pi-codex-guide.md).

## Workspace packages

| Package | Purpose |
| --- | --- |
| [`@earendil-works/pi-coding-agent`](packages/coding-agent) | Pi-Codex CLI and TUI. |
| [`@earendil-works/pi-agent-core`](packages/agent) | Shared agent runtime and session state. |
| [`@earendil-works/pi-ai`](packages/ai) | Shared provider transport layer; broader than the Pi-Codex product surface. |
| [`@earendil-works/pi-tui`](packages/tui) | Terminal UI library. |
| [`@earendil-works/pi-telemetry`](packages/telemetry) | Telemetry contracts and reference adapter. |

## Product boundary

Pi-Codex supports OpenAI Codex subscription authentication and the Luna, Terra, and Sol profiles. It does not support generic provider setup, API-key configuration, local models, llama.cpp, Normal Mode, or stock direct agent tools as product workflows.

The shared packages retain generic structures where that keeps the fork maintainable and upstream synchronization practical. Their presence is not a promise that those upstream capabilities work in the Pi-Codex CLI.

## Development

Read [`AGENTS.md`](AGENTS.md) before working in the repository.

```sh
npm install --ignore-scripts
npm run check
./test.sh
```

Use focused tests while iterating and the full non-e2e gate once the intended change converges. Do not run unrequested builds or modify generated/lock files casually.

## Security

Pi-Codex runs with the permissions of the launching user. Project trust controls automatic loading of project resources; it is not a sandbox. Use containers, VMs, separate worktrees, or external sandboxing for stronger boundaries. Read [Security](packages/coding-agent/docs/security.md) and [Containerization](packages/coding-agent/docs/containerization.md).

## License

MIT
