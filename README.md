# dsh-llm-subscription

A native [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) LLM adapter that puts Claude and Gemini in the model picker — real entries, right next to DeepSeek, with a working reasoning-effort selector — using your existing Claude Code / Antigravity subscriptions instead of a metered API key. It also registers a local Ollama model, for a $0 option with no login of any kind.

If you've seen [`dsh-subscription-gateway`](https://github.com/DavidRm1911/dsh-subscription-gateway), this is the same idea done properly: that one is an HTTP bridge you point DSH's Custom Provider at. This one is an actual `dsh.bundle` plugin registered against DSH's own `dsh-llm` seam (`ctx.llm.registerAdapter`) — same mechanism `dsh-llm-deepseek` uses internally. No Custom Provider screen, no separate process to keep running; it's just there once installed.

## What you get

- **Claude (subscription)**: `claude`, `haiku`, `sonnet`, `opus`, `fable` — each with a native reasoning-effort selector (Low → Max), because Claude's own `--effort` flag supports that independently of which model you pick.
- **Gemini (subscription)**: five Antigravity tiers (`Flash Low/Medium/High`, `Pro Low/High`) — Gemini bakes its intensity into the model name itself, so there's no separate effort control for it.
- **Qwen (local, $0)**: whatever's running in Ollama (`qwen3.5:9b` by default) — no CLI login, no subscription, nothing to authenticate. Starts `ollama serve` itself the first time it's actually used if it isn't already running; never touches it otherwise.
- Every response ends with a `via <real-model-id>` line — `claude --model sonnet` is an alias, and Claude Code sometimes uses a small internal model alongside it for things like session titling. This picks out whichever model actually wrote the visible text (the one with the most output tokens) so you're not left guessing whether you got Sonnet or something else.

## Install

Inside a DSH profile:

```bash
dsh plugin --profile web add dsh-llm-subscription
```

Requires at least one of: the `claude` CLI (logged in via `claude login`), `agy` (Antigravity CLI, logged in), or [Ollama](https://ollama.com) with a model pulled (`ollama pull qwen3.5:9b`) — all already on PATH. Missing one just means that provider's models won't show up; the rest still work fine.


## How it actually works

Claude and Gemini requests shell out to `claude -p` or `agy -p` in headless/JSON mode and reshape the result into the `StreamChunk` sequence DSH's LLM seam expects (`block-start` → `text-delta` → `block-end` → `usage` → `finish`). Neither CLI streams token-by-token in headless mode, so the whole response arrives as one delta — functionally fine, just not incremental. Ollama requests go straight to its local HTTP API (`/api/chat`) the same way, also as one non-streamed delta, for consistency with the other two.

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

**Read this before installing — the ban risk is real, not theoretical, and this section previously understated it.** Anthropic's current [legal and compliance docs](https://code.claude.com/docs/en/legal-and-compliance) state plainly: *"Anthropic does not permit third-party developers to... route requests through Free, Pro, or Max plan credentials on behalf of their users."* The only documented exception is an end user signing in to the **unmodified Claude Code binary itself** — including where a platform hosts that binary as-is. DSH is not the unmodified Claude Code binary; it's a separate framework that this plugin uses to shell out to `claude -p` as a backend and surface the reply in DSH's own picker. That's the pattern the docs describe as not permitted, not the exception. There is no carve-out here for "the plugin never touches your credential" — the credential isn't the issue, routing the request through it on another product's behalf is.

Gemini/Antigravity is the same pattern via `agy`, and there Google is already enforcing it: paid Antigravity accounts (including $250/mo AI Ultra) have been getting hit with 403 "Service disabled for violation of Terms of Service," appeals mostly fail, and it extends to Gemini CLI. Anthropic hasn't shown a public wave of bans for this pattern yet — that's not the same as it being permitted, just that enforcement so far looks different between the two.

This is unofficial, community-built software, not sanctioned by Anthropic, Google, or DeepSeek. Installing it means accepting that risk yourself, on your own accounts. Not legal advice — read the [Usage Policy](https://www.anthropic.com/legal/aup) and the [legal and compliance docs](https://code.claude.com/docs/en/legal-and-compliance) yourself and make your own call.

**Standard this project follows for any provider it adds**: never read/cache/transmit a credential on the user's behalf; only ever invoke the vendor's own official CLI in a documented automation mode; never implement a login flow ourselves; no usage pooled or shared across users.

## License

MIT — see [LICENSE](LICENSE).
