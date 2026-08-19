# Custom Providers

Pi-Codex does not support custom providers as a product configuration. It ships OpenAI Codex subscription authentication and the Luna, Terra, and Sol model profiles only.

The underlying Pi SDK still contains generic provider registration primitives because extensions and programmatic consumers share upstream foundations. They are an implementation-facing compatibility surface, not a supported way to turn Pi-Codex into a multi-provider client. We do not test custom provider authentication, model discovery, request transport, compaction, cache behavior, or settings integration as Pi-Codex workflows.

## If you need another provider

Use upstream Pi or a provider-specific client. Do not add API keys, `models.json` entries, custom OAuth flows, or provider extensions expecting them to be a maintained Pi-Codex path.

## Different from upstream Pi

Upstream Pi documents custom providers for OpenAI-compatible, Anthropic, Google, and other APIs. That documentation intentionally does not apply to the Pi-Codex CLI product. Keeping this short reference preserves the distinction for extensions and migration work without implying supported functionality.
