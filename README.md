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
dsh plugin --profile web add @davidgallo/dsh-llm-subscription
```

Requires the `claude` CLI (logged in via `claude login`) and/or `agy` (Antigravity CLI, logged in) already on PATH. Missing one just means that provider's models won't show up.

## How it actually works

Each request shells out to `claude -p` or `agy -p` in headless/JSON mode and reshapes the result into the `StreamChunk` sequence DSH's LLM seam expects (`block-start` → `text-delta` → `block-end` → `usage` → `finish`). Neither CLI streams token-by-token in headless mode, so the whole response arrives as one delta — functionally fine, just not incremental.

The Claude call always passes `--strict-mcp-config`. Without it, the subprocess quietly inherits whatever MCP servers are configured in your regular Claude Code setup, which leaked unrelated tools into responses that were supposed to be clean completions — a real bug hit while building this, not a guess.

## If this breaks on a DSH update

It might — `cordis` and the `dsh-llm` seam are developer preview with no stable contract, and this plugin depends on internals discovered by reading `dsh-llm-deepseek`'s compiled source, not from documentation. [`dsh-subscription-gateway`](https://github.com/DavidRm1911/dsh-subscription-gateway) does the same job through DSH's stable, documented Custom Provider screen instead — worse UX (no native picker, no effort selector), but it doesn't touch anything that changes between DSH releases. Worth having as a fallback.

## What's genuinely rough right now

- No streaming deltas, as above.
- No image input.
- No credential handling of any kind, because there's no credential — this only ever talks to CLIs you're already logged into.
- Built and tested against DSH `0.1.1-rc.2`. This whole plugin surface (`cordis`, the `dsh-llm` seam) is developer preview and can change without warning.

## License

MIT — see [LICENSE](LICENSE).
