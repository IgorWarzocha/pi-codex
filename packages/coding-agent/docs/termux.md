# Termux on Android

Pi-Codex runs in Termux when Node.js, a supported terminal, and a usable shell are installed. Use Termux from F-Droid or GitHub releases rather than the obsolete Play Store build.

```sh
pkg update
pkg install nodejs git openssh
```

Install Pi-Codex using the distribution route for this fork, then start it normally with `pi`. Global instructions and resources belong under `~/.pi-codex/agent/`, not upstream Pi's `~/.pi/agent/`.

Android terminals have practical clipboard, background-process, audio-device, and storage limitations. Grant storage access only when required, keep sessions backed up, and use `/voice setup` to diagnose realtime audio rather than assuming desktop device names work.

## Different from upstream Pi

The terminal guidance is shared, but generic package-install commands, upstream paths, broad provider authentication, and stock direct-tool examples are not Pi-Codex setup.
