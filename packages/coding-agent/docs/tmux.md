# tmux

Pi-Codex works well inside tmux. Use a current tmux and terminal that support modified keys; tmux must pass the terminal's keyboard protocol through rather than translating it away.

Typical modern configuration:

```tmux
set -g extended-keys on
set -as terminal-features ',xterm*:extkeys'
```

Exact settings depend on tmux and terminal versions. Verify Ctrl/Alt/Shift combinations with `/hotkeys` after changing configuration. For a focused interactive test during development:

```sh
tmux new-session -d -s pi-test -x 80 -y 24
tmux send-keys -t pi-test "pi" Enter
sleep 3 && tmux capture-pane -t pi-test -p
tmux kill-session -t pi-test
```

## Different from upstream Pi

The terminal mechanics are shared. Pi-Codex state, models, tools, and authentication still follow this fork's Codex-only product rules inside tmux.
