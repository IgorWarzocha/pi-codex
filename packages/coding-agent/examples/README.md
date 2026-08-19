# Examples

Example code for shared coding-agent SDK and extensions. Pi-Codex ships a Codex-only Code/Notebook product; examples that configure providers, direct stock tools, or prompt rewriting are implementation references and need adaptation before use.

## Directories

### [sdk/](sdk/)
Programmatic usage via `createAgentSession()`. The generic SDK can customize models, prompts, tools, extensions, and sessions, but Pi-Codex integrations should preserve the product provider/model/runtime policy.

### [extensions/](extensions/)
Example extensions demonstrating:
- Lifecycle event handlers (tool interception, safety gates, context modifications)
- Custom tools (todo lists, questions, subagents, output truncation)
- Commands and keyboard shortcuts
- Custom UI (footers, headers, editors, overlays)
- Git integration (checkpoints, auto-commit)
- System prompt modifications and custom compaction
- External integrations (SSH, file watchers, system theme sync)
- Custom providers (generic SDK examples, not supported Pi-Codex product configuration)

## Documentation

- [SDK Reference](sdk/README.md)
- [Extensions Documentation](../docs/extensions.md)
- [Skills Documentation](../docs/skills.md)
- [Pi-Codex Guide](../docs/pi-codex-guide.md)
