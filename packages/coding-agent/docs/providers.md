# Codex Authentication and Model Profiles

Pi-Codex ships one product provider: `openai-codex`. It is designed for OpenAI Codex subscription authentication, not a general API-key or multi-provider client.

## Sign in

1. Start `pi` interactively.
2. Run `/login`.
3. Select OpenAI Codex and finish the browser sign-in flow.
4. Run `/model` and choose the model profile you want.

`/logout` clears the Pi-Codex credential. Credentials are stored in Pi-Codex's separate agent directory, normally `~/.pi-codex/agent/auth.json`.

If sign-in is unavailable, first check that the session is not in offline mode and that the account has Codex subscription access. Restart after changing proxy or network configuration.

## Supported profiles

Pi-Codex limits its product catalog to these models:

| Model | Default | Context choices | Reasoning choices |
| --- | --- | --- | --- |
| `gpt-5.6-luna` | Yes | 272K, 472K, 872K | low, medium, high, xhigh, max as available |
| `gpt-5.6-terra` | No | 272K, 472K, 872K | low, medium, high, xhigh, max as available |
| `gpt-5.6-sol` | No | 272K, 472K, 872K | low, medium, high, xhigh, max as available |

`/model` is a three-column selector: model, context window, then reasoning. The selector only offers combinations supported by the Codex runtime. `/scoped-models` stores selected profile preferences for cycling.

## Separate state

Pi-Codex does not reuse upstream Pi credentials:

```text
~/.pi-codex/agent/auth.json   # Pi-Codex
~/.pi/agent/auth.json         # upstream Pi
```

Set `PI_CODEX_HOME` to change the application home or `PI_CODING_AGENT_DIR` to set the agent directory directly.

## Different from upstream Pi

The upstream provider catalog, API-key environment variables, cloud providers, OAuth choices, `models.json` local servers, llama.cpp, and custom provider setup are not supported Pi-Codex product configuration. The generic runtime still contains some extensibility primitives for compatibility; their presence is not a supported route to add providers to this fork.
