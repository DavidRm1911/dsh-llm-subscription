# Security & terms-of-use notes

## What this does and doesn't touch

This never reads, stores, extracts, or transmits any credential. It shells out to the `claude` / `agy` CLI binaries already installed and logged in on your machine, and reads their stdout. Each install runs against **your own** already-authenticated session — nothing is shared, proxied, or routed between users.

## On Anthropic's usage terms

In February 2026, Anthropic explicitly banned third-party tools (e.g. OpenClaw, NanoClaw) that extracted a Claude subscription's OAuth token and reused it to authenticate a separate, direct API client — bypassing Claude Code entirely. That is not what this does.

Anthropic's own guidance: *"OAuth authentication is intended exclusively for purchasers of Claude Free, Pro, Max, Team, and Enterprise subscription plans and is designed to support ordinary use of Claude Code and other native Anthropic applications."* What's explicitly prohibited is reselling or intermediating Claude usage between users — each end user authenticating with their own credential is the compliant pattern, and that's what happens here: you log into `claude` yourself, this just triggers the CLI you already logged into.

That said — Anthropic's broader guidance steers products that *wrap* Claude Code toward API-key billing as the unambiguous, explicitly-sanctioned path for third-party integrations. This plugin doesn't do that; it relies on subscription-authenticated CLI automation instead, which is a real gray area, not a clearly-blessed one. This isn't legal advice, and this project offers no guarantee of compliance with Anthropic's (or Google's, for the Antigravity path) current or future terms. If you're installing this for anything beyond personal, individual use, read [Anthropic's Usage Policy](https://www.anthropic.com/legal/aup) and Claude Code's [legal and compliance docs](https://docs.anthropic.com/en/docs/claude-code/legal-and-compliance) yourself before relying on it.

## Standard this project follows for any provider it adds

- Never read, cache, or transmit a credential file on the user's behalf.
- Only ever invoke the vendor's own official CLI/binary, in a documented automation mode, as a subprocess.
- Never implement a login/OAuth flow ourselves — authentication is always the user's own action, outside this tool, before it's ever invoked.
- No usage is pooled, proxied, or shared across users; each install talks only to that one machine's own already-authenticated session.
