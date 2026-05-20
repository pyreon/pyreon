---
'@pyreon/server': patch
'@pyreon/runtime-server': patch
---

fix(server, runtime-server): Class I orphaned timer in prerender + Suspense streaming (audit-leak-classes discoveries)

Two real Class I instances surfaced by the new `audit-leak-classes`
script's `promise-race-no-clear` detector — bugs the lint rule
`pyreon/promise-race-needs-cleartimeout` would have caught at edit
time but pre-dated the rule.

### `@pyreon/server` `ssg.ts:prerender` — orphaned 30s setTimeout

`renderPage`'s `Promise.race([handler(req), setTimeout-reject])`
left the timer pinned for 30s when `handler` won. Same shape as
#734's `@pyreon/zero` `isr.ts revalidate()` fix. Under high-RPS
prerender batches (e.g. a large SSG build), hundreds of timer
closures pile up before they self-clear.

Fix: capture the timer id outside `Promise.race`, `clearTimeout`
in `finally`.

### `@pyreon/runtime-server` `streamSuspense` — orphaned 30s setTimeout

The Suspense streaming boundary races children against a 30s
timeout. The setTimeout *resolves* (rather than rejects) with
`'timeout'` — but the orphaned-timer shape is identical: on
success the timer stays pinned for 30s, holding the resolve
callback + closure. Every Suspense boundary in a long-running
SSR server accumulates one pending timer per rendered request
until it fires.

Fix: same `let timeoutId` + `try { … } finally { clearTimeout }`
pattern.

### Validation

- `@pyreon/server` 166/166 tests pass
- `@pyreon/runtime-server` 143/143 tests pass
- `@pyreon/test-utils` 90/90 tests pass (+15 new for the audit script)
- Lint + typecheck clean
- No public-API surface change
