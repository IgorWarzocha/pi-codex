# Settings

Pi-Codex reads global settings from `~/.pi-codex/agent/settings.json` and trusted project settings from `<project>/.pi/settings.json`. Project settings override global settings; nested objects merge recursively.

```json
{
  "executionMode": "code",
  "piCodex": {
    "openai": { "verbosity": "low", "cacheKeepalive": false },
    "compaction": { "responsesCompaction": true, "v2UserMessageRetention": 64 }
  }
}
```

Use `/settings` for normal changes. It presents stable-height tabs for General, Codex, Voice, Usage, Display, Terminal, and Advanced settings. The file format is useful for versioned shared defaults or automation.

## Pi-Codex settings

| Key | Values / default | Meaning |
| --- | --- | --- |
| `executionMode` | `"code"` (default), `"notebook"` | Code uses isolated cells; Notebook keeps a Deno/TypeScript kernel. |
| `notebook.maxHeapMiB` | `4096` | Maximum notebook kernel heap. |
| `notebook.profile` | string | Notebook profile to load. |
| `piCodex.openai.fast` | `false` | Request OpenAI priority service tier. |
| `piCodex.openai.verbosity` | `"low"` | Response text verbosity: `low`, `medium`, or `high`. |
| `piCodex.openai.forceCachedWebSockets` | `true` | Keep the Codex transport and continuation state warm. |
| `piCodex.openai.cacheKeepalive` | `false` | Refresh an idle cached WebSocket context every 25 minutes. |
| `piCodex.openai.cacheDiagnostics` | `"off"` | `off`, `status`, or `status-and-log`; logging records safe metadata only. |
| `piCodex.openai.webSearchModel` | `gpt-5.6-luna` | Helper model for web search and text image descriptions. |
| `piCodex.compaction.responsesCompaction` | `true` | Use encrypted native Responses Compaction V2 and replay. |
| `piCodex.compaction.v2UserMessageRetention` | `64` | Approximate recent user-message window: `16`, `32`, or `64`. |
| `piCodex.voice.*` | see `/settings` | Realtime voice, audio devices, dictation, delegation, and shortcuts. |
| `piCodex.ui.statusLine` | `true` | Show execution, cache, and usage status above the editor. |
| `piCodex.ui.backgroundShellWidget` | `true` | Show resumable background command status. |
| `piCodex.viewImageFallback` | `false` | Return text image descriptions through the Codex helper model. |

## Shared settings

These retained Pi settings continue to apply:

- `theme`, `externalEditor`, `quietStartup`, `editorPaddingX`, `outputPad`, `autocompleteMaxVisible`, `hideThinkingBlock`, and `markdown` control the TUI.
- `terminal.showImages`, `terminal.imageWidthCells`, `terminal.clearOnShrink`, and `terminal.showTerminalProgress` control terminal presentation.
- `images.autoResize` and `images.blockImages` control attachments and tool images.
- `shellPath` and `shellCommandPrefix` control shell execution. The prefix is executed before every agent shell command; treat it as arbitrary shell code.
- `defaultProjectTrust` is `"ask"`, `"always"`, or `"never"` globally. `transport`, HTTP idle timeout, WebSocket connect timeout, and retry settings retain their shared transport behavior.
- `tuiMode`, `fullscreenExitOutput`, and `fullscreenScrollbar` control terminal scrolling.
- `doubleEscapeAction` and `treeFilterMode` control session-tree navigation.
- `extensions`, `skills`, `prompts`, `themes`, and `packages` add explicit resource paths or package sources. Project resources require trust.

## Trust

Pi-Codex saves trust decisions in `~/.pi-codex/agent/trust.json`. Trust controls whether project `.pi` settings and resources can load. It does not constrain what the model can do after resources or shell commands are available.

Use `/trust` to save a choice. `--approve` trusts project-local files for one invocation; `--no-approve` ignores them.

## Settings migration

On first use, Pi-Codex can import compatible upstream UI, editor, input, terminal, image, and Markdown preferences. It does not import authentication, sessions, providers, model selections, extensions, packages, or Pi-Codex settings. Do not copy an upstream `settings.json` wholesale.

## Different from upstream Pi

The inherited settings type still contains generic provider defaults, direct-tool defaults, Anthropic warnings, token-budget controls, generic compaction thresholds, and arbitrary model cycling fields. They are not the supported Pi-Codex configuration surface. Prefer the tabbed settings UI and the `executionMode`/`piCodex` keys above.
