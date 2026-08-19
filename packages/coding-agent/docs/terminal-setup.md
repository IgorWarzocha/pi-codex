# Terminal Setup

Pi-Codex needs a modern UTF-8 terminal. Truecolor, Kitty keyboard protocol/CSI-u modified keys, and inline image support improve the experience but are not required for basic text use.

## Recommended terminals

Kitty, Ghostty, WezTerm, iTerm2, Windows Terminal, and current VS Code terminals generally work well. Check the terminal's current documentation for its keyboard protocol and image support; vendor behavior changes independently of Pi-Codex.

## Modified keys

Some shortcuts require a terminal and multiplexer to report Ctrl/Alt/Shift modifiers separately. If a shortcut does not work:

1. Run `/hotkeys` to see Pi-Codex's configured binding.
2. Check terminal keyboard-protocol settings.
3. If using tmux, configure extended keys; see [tmux](tmux.md).
4. Rebind the action in `~/.pi-codex/agent/keybindings.json` if necessary.

## Images and fullscreen mode

`tuiMode` is `regular` by default, using terminal-owned scrollback. `fullscreen` keeps the transcript in an application-owned scroll region while the editor and status stay fixed. Inline image behavior depends on the terminal protocol; Pi-Codex can display text fallbacks when configured.

Use `terminal.showImages`, `terminal.imageWidthCells`, and `images.autoResize` in Settings to tune rendering. Read [Themes](themes.md) for truecolor notes.

## Different from upstream Pi

Terminal mechanics are largely inherited. Upstream path, provider, and direct-tool documentation is not relevant to terminal configuration; use Pi-Codex keybindings and state paths.
