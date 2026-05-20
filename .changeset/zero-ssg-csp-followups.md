---
'@pyreon/zero': patch
---

fix(zero): ssg-plugin Promise.race timer leaks (×2, same shape as #734) + csp.ts `_clientNonce` cross-request bleed

Follow-up to #734's leak-class sweep, closing 2 of the 3 LOW patterns
disclosed in that PR's "audit byproducts" section.

### 1. `ssg-plugin.ts` — orphaned 30s timeout per successful render (×2)

Same exact shape as #734's `isr.ts revalidate()` fix. Two sites in
`ssg-plugin.ts` ran `Promise.race([work, new Promise((_, reject) =>
setTimeout(reject, 30_000))])` without clearing the timer when `work`
won the race:

- `renderOne(p)` — per-path SSG render (line 1156)
- 404 render loop — per-locale 404 emission (line 1399)

Each successful render left one pending 30s timer pinning a closure +
rejection callback. Bounded by route count + finished within the build
window so the production impact is small (every modern Node GC handles
N pending timers fine until they self-clear), but worth fixing for
consistency with the isr.ts repair AND because the per-path concurrent
worker pool (default `concurrency: 4`) can have up to 4 timer closures
in flight simultaneously on large sites.

Fix: capture the timer id and `clearTimeout` in a new `finally` block
on each try/catch. Identical pattern to the isr.ts fix.

The audit's prior "3 sites" disclosure was off — line 517 is the
`_atomicSeq` variable, not a Promise.race timer. Only 2 sites needed
fixing.

### 2. `csp.ts` — `_clientNonce` cross-request bleed

`cspMiddleware` wrote per-request nonces to a module-level
`_clientNonce` variable, then `useNonce()` read that variable as a
"client-side fallback" when `locals.cspNonce` was undefined. Two
problems:

1. **Server-side cross-request bleed**: with concurrent SSR requests,
   request A's nonce would overwrite `_clientNonce` before B finished
   rendering. If any render path bypassed the locals-context plumbing
   (a custom middleware order, a route renderer that didn't go through
   `provideRequestLocals`), B's `useNonce()` could read A's nonce.
2. **Client-side fallback was always-`''`**: the "Client/dev: falls
   back to module-level variable set by middleware" JSDoc claim was
   broken-by-design. Middleware doesn't run in the browser, so
   `_clientNonce` was always the build-time initial value `''` on
   the client.

Fix: remove the module-level variable entirely. `useNonce()` returns
`''` when no per-request locals context is active. Nonces are SSR-only
by design — a script-tag nonce should be rendered during SSR through
`useNonce()` so the value the browser sees IS the value the response's
`Content-Security-Policy` header authorized. JSDoc updated to clarify
this contract.

### Regression tests + bisect

- `packages/zero/zero/src/tests/csp.test.ts` updated. Removed the
  "useNonce returns the nonce set by middleware" test (it was
  inadvertently exercising the bug — it called `useNonce()` outside
  any request context and asserted it returned `localsA.cspNonce`,
  which only worked via the `_clientNonce` cross-request bleed).
  Added: "useNonce returns empty string outside any request context
  (no cross-request bleed)" — runs the middleware TWICE with
  different nonces, asserts `useNonce()` returns `''` between and
  after both. **Bisect-verified**: restored `_clientNonce` + module
  writes → spec fails with `expected '<base64 nonce>' to be ''`;
  restored → 16/16 csp tests pass.
- ssg-plugin fix is **mechanical copy-paste** of the same `let
  timeoutId; try { ... } finally { if (timeoutId) clearTimeout }`
  shape proven by #734's `isr-revalidate-timer-leak-repro.test.ts`.
  A dedicated test would require extracting `renderOne` from inside
  `closeBundle`'s closure (significant refactor); the isr.ts test
  already proves the pattern works, and full `@pyreon/zero` 947/948
  tests still pass.

### Validation

- `@pyreon/zero` 947/948 tests pass (1 pre-existing skip)
- Lint + typecheck clean across all 4 zero packages
- No public-API breakage — `useNonce()` signature unchanged

### Remaining `actions.ts` follow-up

The 3rd LOW pattern from #734 (`actionRegistry` HMR FinalizationRegistry
purge) stays deferred — <5KB dev-only ceiling is too small to justify
the WeakRef/finalizer complexity. The JSDoc note added in #734 already
documents the trade-off.
