# dsh-llm-subscription

A native [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) LLM adapter that puts Claude and Gemini in the model picker — real entries, right next to DeepSeek, with a working reasoning-effort selector — using your existing Claude Code / Antigravity subscriptions instead of a metered API key.

If you've seen [`dsh-subscription-gateway`](https://github.com/DavidRm1911/dsh-subscription-gateway), this is the same idea done properly: that one is an HTTP bridge you point DSH's Custom Provider at. This one is an actual `dsh.bundle` plugin registered against DSH's own `dsh-llm` seam (`ctx.llm.registerAdapter`) — same mechanism `dsh-llm-deepseek` uses internally. No Custom Provider screen, no separate process to keep running; it's just there once installed.

## What you get

- **Claude (subscription)**: `claude`, `haiku`, `sonnet`, `opus`, `fable` — each with a native reasoning-effort selector (Low → Max), because Claude's own `--effort` flag supports that independently of which model you pick.
- **Gemini (subscription)**: five Antigravity tiers (`Flash Low/Medium/High`, `Pro Low/High`) — Gemini bakes its intensity into the model name itself, so there's no separate effort control for it.
- Every response ends with a `via <real-model-id>` line — `claude --model sonnet` is an alias, and Claude Code sometimes uses a small internal model alongside it for things like session titling. This picks out whichever model actually wrote the visible text (the one with the most output tokens) so you're not left guessing whether you got Sonnet or something else.

## Install

Inside a DSH profile:

```bash
dsh plugin --profile web add dsh-llm-subscription
```

Requires the `claude` CLI (logged in via `claude login`) and/or `agy` (Antigravity CLI, logged in) already on PATH. Missing one just means that provider's models won't show up.


## How it actually works

Each request shells out to `claude -p` or `agy -p` in headless/JSON mode and reshapes the result into the `StreamChunk` sequence DSH's LLM seam expects (`block-start` → `text-delta` → `block-end` → `usage` → `finish`). Neither CLI streams token-by-token in headless mode, so the whole response arrives as one delta — functionally fine, just not incremental.

The Claude call always passes `--strict-mcp-config`. Without it, the subprocess quietly inherits whatever MCP servers are configured in your regular Claude Code setup, which leaked unrelated tools into responses that were supposed to be clean completions — a real bug hit while building this, not a guess.

## If this breaks on a DSH update

It might — `cordis` and the `dsh-llm` seam are developer preview with no stable contract, and this plugin depends on internals discovered by reading `dsh-llm-deepseek`'s compiled source, not from documentation. [`dsh-subscription-gateway`](https://github.com/DavidRm1911/dsh-subscription-gateway) does the same job through DSH's stable, documented Custom Provider screen instead — worse UX (no native picker, no effort selector), but it doesn't touch anything that changes between DSH releases. Worth having as a fallback.

## What's genuinely rough right now

- No streaming deltas, as above.
- No thinking/reasoning content — neither CLI's JSON output exposes the actual chain-of-thought text, only a token count. Verified against both, in every output mode each offers; not something fixable from this side. The reasoning-effort selector still controls how much thinking happens, just not what it says.
- Gemini calls can't be isolated from `agy`'s own built-in tools the way Claude calls are (`--strict-mcp-config`) — there's no equivalent flag. Verified empirically: asked headless, `agy` reports its full native tool set. This adapter never parses or acts on tool-call output, so there's no execution path through here, but the model's own awareness of those tools can still shape its answers.
- No image input.
- No credential handling of any kind, because there's no credential — this only ever talks to CLIs you're already logged into.
- Built and tested against DSH `0.1.1-rc.2`. This whole plugin surface (`cordis`, the `dsh-llm` seam) is developer preview and can change without warning.

## Security & terms of use

This never reads, stores, extracts, or transmits any credential. It shells out to the `claude` / `agy` CLI binaries already installed and logged in on your machine, and reads their stdout. Nothing is shared, proxied, or routed between users — each install runs against your own already-authenticated session.

In February 2026, Anthropic explicitly banned third-party tools (OpenClaw, NanoClaw) that extracted a Claude subscription's OAuth token and reused it to authenticate a separate, direct API client — bypassing Claude Code entirely. That's not what this does. Anthropic's own guidance: *"OAuth authentication is intended exclusively for purchasers of Claude Free, Pro, Max, Team, and Enterprise subscription plans and is designed to support ordinary use of Claude Code and other native Anthropic applications."* What's explicitly prohibited is reselling or intermediating Claude usage between users — each end user authenticating with their own credential is the compliant pattern, and that's what happens here.

That said, Anthropic's broader guidance steers products that *wrap* Claude Code toward API-key billing as the unambiguous, explicitly-sanctioned path for third-party integrations. This plugin doesn't do that — it's a real gray area, not a clearly-blessed one. Not legal advice, no guarantee of compliance with Anthropic's (or Google's, for Antigravity) current or future terms. If you're installing this for anything beyond personal use, read [Anthropic's Usage Policy](https://www.anthropic.com/legal/aup) and Claude Code's [legal and compliance docs](https://docs.anthropic.com/en/docs/claude-code/legal-and-compliance) yourself.

**Standard this project follows for any provider it adds**: never read/cache/transmit a credential on the user's behalf; only ever invoke the vendor's own official CLI in a documented automation mode; never implement a login flow ourselves; no usage pooled or shared across users.

## License

MIT — see [LICENSE](LICENSE).
