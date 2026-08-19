# Pi-Codex

<p align="center">
  <img src="src/modes/interactive/assets/pi-codex-duo.png" alt="Pixel-art Pi and Codex characters pointing at each other" width="384">
</p>

Pi-Codex is a TUI-first fork of Pi for the OpenAI Codex subscription runtime. It keeps Pi's session tree, extensions, themes, prompts, packages, project trust, JSON/RPC interfaces, and SDK foundations, while making Codex-native execution, caching, compaction, voice, skills, and settings first-class.

## Install

```sh
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
pi
```

Run `/login` and authenticate with OpenAI Codex. Then use `/model` to choose Luna, Terra, or Sol; a 272K, 472K, or 872K context window; and a reasoning level.

Pi-Codex state is separate from upstream Pi:

```text
~/.pi-codex/agent/    # Pi-Codex
~/.pi/agent/          # upstream Pi
```

## What is different

- **One product provider:** OpenAI Codex subscription authentication.
- **Three model families:** `gpt-5.6-luna`, `gpt-5.6-terra`, and `gpt-5.6-sol`.
- **Code Mode by default:** the agent composes native capabilities inside `exec` through `tools.*`; `wait` resumes yielded work.
- **Notebook Mode:** an optional persistent Deno/TypeScript kernel.
- **Native skill structure:** important top-level and categorized lazy `SKILL.md` packages through `tools.skills(...)`.
- **Cache-aware operation:** stable prompts/tools, cached WebSockets, 30-minute cache lifetime, Responses Compaction V2, and cache-aware tree summaries.
- **Realtime voice and usage:** native voice/dictation/LAN control and Codex subscription usage.

Pi-Codex does not ship a general provider catalog, local models, llama.cpp, Normal Mode, API-key setup, or top-level `read`/`bash`/`edit`/`write` agent tools.

## Different from upstream Pi

This package retains shared Pi APIs and compatibility internals so the fork stays maintainable, but those are not product promises. Follow Pi-Codex documentation for state paths, provider/model selection, tools, skills, prompts, compaction, and voice; upstream guides for those features are not a substitute.

## Documentation

Start with [Pi-Codex Guide](docs/pi-codex-guide.md). It explains setup, migration, skills, state separation, system prompts, custom tools, compaction, voice, and deliberate differences from upstream Pi.

- [Quickstart](docs/quickstart.md)
- [Using Pi-Codex](docs/usage.md)
- [Settings](docs/settings.md)
- [Skills](docs/skills.md)
- [Code Mode Custom Tools](docs/custom-tools.md)
- [Sessions](docs/sessions.md)
- [Security](docs/security.md)
- [Extensions](docs/extensions.md)
- [SDK, RPC, and JSON modes](docs/sdk.md)

Every affected page includes a compact **Different from upstream Pi** section. The installed package and standalone binaries ship the full Markdown documentation set under `docs/`.

## Development

Read repository `AGENTS.md` files before modifying the fork. Install dependencies with:

```sh
npm install --ignore-scripts
```

After code changes, run `npm run check`. Use focused tests while iterating, then `./test.sh` once work converges. Do not build or run the full raw Vitest suite unless the task requires it.

## License

MIT
