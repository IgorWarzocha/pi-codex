# TUI Components

`@earendil-works/pi-tui` is the retained terminal UI foundation used by Pi-Codex. It provides components, focus, overlays, rendering, text layout, keybinding dispatch, and terminal lifecycle primitives.

## Core contracts

- A `Component` renders terminal lines for an assigned width and reports its height.
- A `Focusable` component participates in focus traversal and key handling.
- Overlays receive input above the normal component tree and must clean up on dismissal.
- Rendering is width-sensitive. Components must wrap, truncate, or constrain every line to the provided width.
- Theme changes require invalidating cached rendered content.
- `CURSOR_MARKER` marks the desired hardware cursor position in rendered output.

## Build custom UI through extensions

Use the extension UI API for most Pi-Codex screens, widgets, notifications, and overlays. Keep UI deterministic under narrow terminals, keyboard navigation, mouse input, and live theme changes. Follow the existing `/settings`, model selector, session tree, and voice UI patterns in `src/modes/interactive/components/`.

Do not assume upstream Normal Mode controls exist. Pi-Codex UI should describe Code/Notebook Mode, Codex model profiles, cache/usage state, and native tools.

## Test terminal UI

Test rendering at multiple widths, including narrow widths. Test focus order, Escape dismissal, keyboard bindings, mouse behavior where applicable, and theme changes. For interactive end-to-end checks, use a controlled tmux session and capture its pane; see [tmux](tmux.md).

## Different from upstream Pi

The TUI package is broadly shared, but product components are Pi-Codex-specific. Do not copy upstream model/provider/settings screenshots or direct-tool widgets into fork documentation or extensions without adapting their semantics.
