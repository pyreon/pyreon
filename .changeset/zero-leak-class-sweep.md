---
'@pyreon/zero': patch
---

fix(zero): post-#725/#729/#730/#733 leak-class sweep — `<ThemeToggle>` matchMedia/effect pile-up + ISR `revalidate` orphaned setTimeout

Audit pass across `packages/zero/*` (4 packages) for the same patterns
behind #725 (position-based pop on shared module-level stack),
#729 (sibling-unmount LIFO violation), #730 (refcount under-count +
inflight-cache rejection), and #733 (vue-compat context-stack leak +
lint AstCache unbounded).

Surface area is large (~5,500 lines of plugin + runtime code across
zero, zero-cli, create-zero, meta) but the **zero packages are
structurally clean** — no `#725`-shape position-based stack ops on
shared mutable state, no `#730`-shape promise-queue rejection bugs,
and every module-level cache (`prefetched` Map in `link.tsx`, ISR
LRU + revalidating Set, rate-limit store, `entry-server` request
WeakMap, vite-plugin WeakMap caches) is already bounded.

This PR fixes the 2 real-impact bugs the audit surfaced and
documents 1 minor dev-only HMR consideration.

### 1. `<ThemeToggle>` — N instances → N matchMedia listeners + N effects

`initTheme()` was non-idempotent. Each `<ThemeToggle />` instance
called `initTheme()` in its render body, and `initTheme()` registered
an `onMount(() => …)` callback. The callback added one
`matchMedia('(prefers-color-scheme: dark)').change` listener AND one
`effect()` to mirror the resolved theme to the document — both
pointed at the SAME module-level `_osPrefersDark` signal and the
SAME `document.documentElement`.

Real-app symptom: an app with 2+ `<ThemeToggle>` widgets (header +
footer is the canonical shape) — or `<ThemeToggle>` mounted
alongside an explicit `initTheme()` call in `_layout.tsx` (which
the JSDoc literally recommends) — registers N media-query listeners
+ N effects. Each OS color-scheme flip then fires N redundant
updates writing the SAME value to `document.documentElement.dataset.theme`
and the SAME value to N favicon links. Class D event-listener pile-up.

Fix: refcount-based idempotent setup. First mount runs the real
setup (localStorage read + matchMedia listener + effect); subsequent
mounts only bump the refcount. Each unmount decrements; when the
count returns to 0 the shared teardown runs. The fix preserves the
"all instances unmounted, new instance mounts" symmetry — the
refcount can return to 0 and re-arm.

### 2. `createISRHandler.revalidate()` — orphaned timeout per success

`revalidate()` set a 30s `setTimeout` via `Promise.race` to bound
hung handlers, then did NOT clear the timer when `handler(req)` won
the race (the success path — i.e. every healthy revalidation). Each
background revalidation therefore left one pending timer for up to
`REVALIDATE_TIMEOUT_MS` (default 30s), each pinning a closure + the
rejection callback. Under sustained revalidation traffic on a
high-RPS deployment, hundreds of pending timers pile up before
they self-clear.

Fix: capture the timer id and `clearTimeout` in `finally` so the
success path tears down the rejection branch immediately.

### 3. `actionRegistry` — dev-only HMR caveat (documented, not coded)

`defineAction()` mints a fresh `crypto.randomUUID()` and stores
`{ id, handler }` in a module-level Map. Under Vite HMR, the module
re-runs → new UUID → orphaned entry. Bounded by the count of
distinct UUIDs minted in the session; a realistic dev session sees
<50 entries, total dev-memory cost <5KB. **Production registers
each module exactly once at startup — no leak.** A
FinalizationRegistry-based purge is tracked as a follow-up; the
current cost is too small to justify the WeakRef/finalizer
complexity (the playbook precedent — #733's `lint/AstCache` —
fixed a leak that grew to hundreds of MB).

Documented inline in `actions.ts` so future contributors see the
trade-off before reaching for a "fix."

### Regression tests + bisect

- `packages/zero/zero/src/tests/theme-init-leak-repro.test.ts`
  (2 specs) — 3 and 5 mounted ThemeToggles register exactly ONE
  matchMedia listener. **Bisect-verified**: reverted refcount logic
  in `initTheme` → both specs fail with `expected 1 times, but got
  3 times` / `got 5 times`; restored → 2/2 pass.
- `packages/zero/zero/src/tests/isr-revalidate-timer-leak-repro.test.ts`
  (1 spec) — 5 successful revalidations leave zero pending revalidate
  timers (instruments `globalThis.setTimeout` / `clearTimeout`).
  **Bisect-verified**: removed `clearTimeout(timeoutId)` from the
  `finally` block → spec fails with `expected 5 to be 0`; restored
  → 1/1 pass.

### Validation

- `@pyreon/zero` 947/948 tests pass (1 pre-existing skip, +3 new
  regression specs)
- Lint + typecheck clean across all 4 zero packages
- Zero public-API breakage; `_resetInitThemeForTests` is `@internal`

### Audit byproducts (NOT in this PR — deliberately scoped follow-ups)

The audit also surfaced several LOW patterns worth noting:

1. **`@pyreon/zero` `ssg-plugin.ts` 3× same `Promise.race` shape** —
   lines 517, 1159, 1402 (build-time SSG render timeouts, mode
   switch timeouts). Lower impact than `isr.ts` because each runs
   during `vite build`, not per-request — total pending-timer count
   is bounded by the route count + finished within the build window.
   Worth fixing for consistency; deferred to keep this PR small.
2. **`@pyreon/zero` `csp.ts` `_clientNonce` cross-request mutation** —
   mutable module-level variable used as a request-scoped fallback.
   Correctness hazard (cross-request bleed) more than a leak; the
   primary read path uses the per-request locals object so the
   fallback is rare. Worth a follow-up to remove the module-level
   mutation entirely.
3. **`@pyreon/zero` `actions.ts` FinalizationRegistry purge** — as
   described above, the WeakRef/finalizer treatment of `actionRegistry`
   for HMR cleanup. Tracked, deferred for cost/benefit.

Plus several confirmed-bounded patterns NOT changed: `link.tsx`
`prefetched` Map (200-entry FIFO cap), `isr.ts` cache (LRU-capped),
`rate-limit.ts` store (10000-cap + expired sweep), `entry-server.ts`
request-keyed WeakMap (GC-safe), `vite-plugin.ts` per-instance
WeakMap caches (GC-safe).

### `pyreon doctor` baseline

Saved at `/tmp/doctor-zero-baseline.json`. 25 findings across
`packages/zero/*`: 0 errors + 20 warnings + 5 infos. Top patterns:
`no-error-without-prefix` (8), `no-unbatched-updates` (4),
`no-raw-addeventlistener` (2), `process-dev-gate` (2),
`raw-remove-event-listener` (2). Separate hardening pass; this PR
addresses the structural bugs not caught by static lint rules.
