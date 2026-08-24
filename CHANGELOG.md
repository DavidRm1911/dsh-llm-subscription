# Changelog

## 0.1.4

- No code changes. Clean republish after `npm publish` for 0.1.3 hit a 403 mid-flow (`npm view` confirmed 0.1.3 had actually gone through fine — this bump exists only so there's an unambiguous, freshly-verified version on the registry).

## 0.1.3

- Added a third provider, `qwen-local`, backed by [Ollama](https://ollama.com) (`qwen3.5:9b` by default) — a $0 option with no CLI login of any kind. Same lazy-start pattern as `dsh-subscription-gateway`'s Python Ollama provider: never touches `ollama serve` until the first real call, and only if it isn't already running.

## 0.1.2

- Providers are only registered if their CLI is actually found on PATH at startup — previously both were always registered, so picking Gemini without `agy` installed threw a raw Node `ENOENT` instead of a clean error.
- Errors now use `LlmError` with real codes (`MISSING_CLI`, `TIMEOUT`, `PROVIDER_ERROR`, `INVALID_RESPONSE`) instead of plain `Error`, so they render the same way DSH's own native errors do.
- Documented (not fixed — no fix available) that `agy` headless calls can't be isolated from its own built-in tools the way Claude calls can (`--strict-mcp-config`).
- Documented (not fixed — no data to fix with) that neither CLI exposes actual thinking/reasoning text, only a token count.

## 0.1.1

- Fixed: `cordis.patch.yml`'s insert entry still pointed at the old scoped package name (`@davidgallo/dsh-llm-subscription`) after `package.json` was renamed unscoped. `0.1.0` was unusable via a real `npm install` — only worked during development via a local `file:` link, which doesn't re-copy on every edit and so never caught it. Found by actually installing `0.1.0` from the real npm registry and booting against it.

## 0.1.0

Initial release. Claude and Gemini in DSH's native model picker, with a working reasoning-effort selector and real-model attribution — broken by the bug fixed in 0.1.1.
