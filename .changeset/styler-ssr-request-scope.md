---
"@pyreon/styler": patch
"@pyreon/runtime-server": patch
---

Fix a cross-request bug in concurrent streaming SSR: the styler's SSR rule buffer
and streaming flush watermark are now scoped per request.

`@pyreon/styler`'s `sheet` is a module-level singleton, and its SSR accumulation
state (`ssrBuffer` + the streaming `flushSSRPending()` watermark) lived on the
instance. Under `renderToStream` / `mode: 'stream'`, two CONCURRENT streaming
renders therefore shared one buffer and one watermark — request A's per-boundary
flush advanced the watermark past request B's rules, so a boundary could ship
missing or another request's CSS (FOUC / cross-request styles).

`@pyreon/runtime-server` (which owns the request lifecycle and can use
`AsyncLocalStorage` — the styler is browser-safe and cannot import
`node:async_hooks`) now establishes a per-request styler scope around every
render and exposes an opaque per-request bag via
`globalThis.__PYREON_STYLER_REQUEST_STATE__`. The styler stashes its SSR state
in that bag when a scope is active, and falls back to its instance state
otherwise — so string SSR, SSG, direct callers and the client are unchanged
(the change is strictly additive; it only ISOLATES concurrent streams).

Bisect-verified: neutering the styler's scope getter leaks request A's rules into
request B's flush; reverting the runtime-server scope wrap leaves renders with no
per-request bag. String mode was already synchronous-safe; the caches (which are
content-addressed) stay correctly shared.
