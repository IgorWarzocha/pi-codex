# Codex Model Profiles

Pi-Codex exposes one Codex provider and three model families. `/model` selects a complete profile rather than browsing a provider catalog.

## Select a profile

Open `/model` or press its configured keybinding. Use the cursor keys to move across three columns:

1. **Model:** Luna, Terra, or Sol.
2. **Context:** 272K, 472K, or 872K.
3. **Reasoning:** low, medium, high, xhigh, or max where the Codex runtime permits it.

The selected profile applies to future turns. Pi-Codex constrains the model catalog after credential and remote-catalog resolution, so unsupported models do not become product choices just because an inherited configuration references them.

## Model families

| ID | Label | Default |
| --- | --- | --- |
| `gpt-5.6-luna` | Luna | Yes |
| `gpt-5.6-terra` | Terra | No |
| `gpt-5.6-sol` | Sol | No |

Luna is the initial default. `/scoped-models` manages saved user profiles for model cycling. It does not enable arbitrary provider/model identifiers.

## CLI selection

Use `--model` and `--thinking` when launching a session non-interactively or from automation. Keep values within the supported Pi-Codex profile matrix; the interactive selector is the clearest way to see valid context and reasoning combinations.

```sh
pi --model gpt-5.6-terra --thinking high "Review the current branch"
```

## Different from upstream Pi

Pi-Codex does not support `models.json` as an end-user mechanism for Ollama, vLLM, LM Studio, proxies, custom API endpoints, pricing overrides, or compatibility flags. Those generic structures remain in retained upstream internals but are deliberately outside the shipped Codex-only product surface.
