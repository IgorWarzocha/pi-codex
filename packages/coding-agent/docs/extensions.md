# Extensions

Extensions are TypeScript modules that customize Pi-Codex lifecycle behavior, commands, UI, resources, and advanced tool integration. They remain powerful and are loaded with the same project-trust boundary as Pi.

> An extension runs with your user permissions. Read and trust its source before enabling it.

## Locations

| Scope | Location |
| --- | --- |
| Global | `~/.pi-codex/agent/extensions/` |
| Project | `<cwd>/.pi/extensions/` in a trusted project |
| Explicit | `extensions` settings or `--extension <path>` |
| Package | an installed Pi package's extension entry |

Run `/reload` after changing a local extension. Use `--no-extensions` to disable discovery for one run.

Pi-Codex's own product extension is built in. It supplies the guide, usage, voice, compaction, and background-shell integration and is not a user-managed package.

## Start small

An extension exports a default function accepting the extension API:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function example(pi: ExtensionAPI): void {
	pi.registerCommand("project-status", {
		description: "Explain the current project state",
		handler: async (_args, ctx) => {
			if (!ctx.isIdle()) {
				ctx.ui.notify("Wait for the current turn", "warning");
				return;
			}
			pi.sendUserMessage("Read the project instructions and summarize the current project state.");
		},
	});
}
```

Place it in `~/.pi-codex/agent/extensions/project-status.ts` or trusted `.pi/extensions/project-status.ts`.

## What extensions can do

The retained extension API supports:

- slash commands, flags, prompts, widgets, overlays, and custom UI;
- session, agent, tool, compaction, and tree lifecycle events;
- session entries and model-visible developer messages;
- custom tool definitions and provider interception for implementation work;
- project resources, package loading, and keybinding hints;
- RPC/UI integration for advanced clients.

Read the exported types in `src/core/extensions/types.ts` before building an advanced extension. They are the source of truth for event names and payloads.

## Pi-Codex lifecycle rules

- A model-visible developer message can update the active session without starting a turn. Use it for capabilities, state changes, or voice events that the agent should know.
- Use `pi.sendUserMessage(...)` when an extension intentionally starts a turn. If the agent is busy, queue a follow-up rather than silently replacing user work.
- `before_agent_start` runs for user and developer messages that trigger a turn. Do not use it to rewrite Pi-Codex's system prompt; the heavy Code/Notebook prompt is native.
- Project extensions run only after trust. Global extensions are user-controlled code and always load unless explicitly disabled.

## Code and Notebook compatibility

Pi-Codex models receive top-level `exec` and `wait`; Notebook Mode also receives `notebook`. Native operations are composed inside `exec` through `tools.*`.

When writing prompts, tools, examples, or agent instructions, use that surface. Do not assume the model has top-level upstream Pi `read`, `bash`, `edit`, `write`, `grep`, `find`, or `ls` tools. An extension may still call retained lower-level APIs where appropriate, but should not teach the product prompt an unsupported tool contract.

Custom command-backed capabilities normally belong in [Code Mode Custom Tools](custom-tools.md). Use an extension when the capability needs lifecycle state, UI, provider interception, or an exposed schema.

## Resource and package compatibility

Extensions can bundle prompts, themes, skills, and custom code in Pi packages. Test them in a clean Pi-Codex state directory. Do not assume upstream authentication, provider catalogs, Normal Mode, or global `~/.pi/agent` resources exist.

The retired `@howaboua/pi-codex-conversion` extension is skipped because its behavior is now native. Remove it from user configuration rather than attempting to load it twice.

## Different from upstream Pi

The generic extension API is intentionally retained to keep this fork syncable and extensible. The supported product is not generic Pi: extensions that add providers, depend on direct stock tools, rewrite the stock system prompt, or recreate the old conversion extension are unsupported and may conflict with native Pi-Codex behavior.
