---
'@pyreon/runtime-dom': patch
'@pyreon/solid-compat': patch
---

fix(runtime-dom, solid-compat): three findings from post-merge deep audit — double-call regression, prototype-pollution alert still open, defensive `Object.keys` for handler iteration

After the dynamic-collapse PR sequence merged (#765 / #766 / #767 / #771 / #773 / #775 / #778), a careful re-read surfaced three real issues. All three are narrow, low-risk fixes shipping together as a deep-review follow-up.

## Finding 1 (correctness) — `_rsCollapseDyn` / `_rsCollapseDynH` called `valueIndex()` TWICE per re-run

The runtime helpers routed the class binding through `_bindDirect`'s plain-callable fallback. That fallback calls the source function once and passes the result to the inner callback — but the inner callback IGNORED the passed value and called `valueIndex()` AGAIN to compute the index.

**Symptom**: side-effecting cond expressions fired twice per re-run. A user's
`<Button state={(modifyState(), cond) ? 'a' : 'b'}>` would invoke
`modifyState()` twice on every value/mode change.

**Fix**: replace the `_bindDirect` indirection with a direct `renderEffect` call. The callback now reads both accessors inside one renderEffect — same subscription contract (a change to either re-runs only this className assignment), but `valueIndex()` runs exactly once per re-run, matching the original source's implicit call-count semantics.

**Bisect-verified** by `valueIndex() is called EXACTLY ONCE per re-run` in `rs-collapse-dyn.browser.test.ts`: pre-fix the spec fails with `expected 2 to be 1` (double call); restored → 16/16 pass.

## Finding 2 (security) — CodeQL alert #22 stayed open after #778

PR #778 added explicit `key === '__proto__' || ...` checks expecting them to satisfy CodeQL's `js/prototype-polluting-assignment` taint-tracking. CodeQL re-scanned and the alert moved from line 1040 → 1051 (my added code shifted positions) but stayed **OPEN** — the analyzer still flagged the `obj[key] = value` write itself, regardless of the guard.

**Fix**: use `Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true })` for the assignment. That bypasses the prototype chain entirely — even if a setter has been installed on `Object.prototype` for `key`, the write installs an OWN data property on `target` without invoking it. Combined with the simplified inline guard (drop the redundant `typeof key === 'string' &&` outer check — literal-string `===` against a `string | number` key is already type-safe), the write is double-safe.

Semantics are identical to `obj[key] = value` for a plain data property; the only difference is that setter chains on the prototype are NOT triggered. All 218 `@pyreon/solid-compat` tests pass unchanged.

## Finding 3 (defense-in-depth) — `for...in` on handlers leaks inherited enumerable properties

`_rsCollapseH` (PR #681) and `_rsCollapseDynH` (#773) both iterate the handlers object via `for (const key in handlers)`. `for...in` includes inherited enumerable properties, so a polluted `Object.prototype` could inject fake handlers.

**Fix**: use `Object.keys(handlers)` which returns OWN enumerable keys only. Zero-cost — same iteration shape, narrower membership.

The compiler emits clean object literals (`{ onClick: ..., onPointerEnter: ... }`) with no prototype-pollution surface in practice. This is pure defense-in-depth — the practical risk requires an attacker to first pollute `Object.prototype` globally, which is a much broader compromise than a leaked handler.

## Bisect verification

| Fix | Bisect | Outcome |
|---|---|---|
| #1 (double-call) | Revert `renderEffect` → `_bindDirect(...) + valueIndex() inside` | New spec fails `expected 2 to be 1`; restored → 16/16 |
| #2 (CodeQL #22) | CodeQL re-scan on merge will close (no local CodeQL runner) | Documented + reasoned via `Object.defineProperty` |
| #3 (`for...in`) | Behavioral equivalent for clean object literals; defense-only | All 47 runtime-dom browser specs + 218 solid-compat specs unchanged |

## Validation

- `bun run --filter='@pyreon/runtime-dom' typecheck` — clean
- `bun run --filter='@pyreon/solid-compat' typecheck` — clean
- `bun run --filter='@pyreon/runtime-dom' lint` — zero errors
- `bun run --filter='@pyreon/runtime-dom' test` — 681 + 1 skipped pass
- `bun run --filter='@pyreon/runtime-dom' test:browser` — **47/47** (15 dynamic-collapse + 1 new regression spec)
- `bun run --filter='@pyreon/solid-compat' test` — 218/218 pass
- `bun run gen-docs --check` — clean
- `bun run check-doc-claims` — clean
- `bun run check-manifest-depth` — clean
- `bun run check-bundle-budgets` — clean (runtime-dom + solid-compat unchanged)

## Surfaces updated

- `packages/core/runtime-dom/src/template.ts` — `_rsCollapseDyn` + `_rsCollapseDynH` use `renderEffect` directly (no `_bindDirect` indirection); `_rsCollapseH` + `_rsCollapseDynH` use `Object.keys` (not `for...in`)
- `packages/core/runtime-dom/src/tests/rs-collapse-dyn.browser.test.ts` — new regression spec locking the 1:1 `valueIndex()`-call contract
- `packages/tools/solid-compat/src/index.ts` — `applyAtPath` uses `Object.defineProperty` for the bracket write + simplified guard
- `.changeset/post-merge-deep-review-fixes.md` — this changeset

## What's NOT in this PR

A wider audit of the recent merges turned up other surfaces I considered but did NOT include:

- **Other unbounded regex quantifiers in `pyreon-intercept.ts`** (e.g. `\\bFor\\b[^=]*\\beach`) — measured polynomially worst-case (O(N²) on N "For" runs) but CodeQL didn't flag them, the input is dev source (not adversary-controlled), and fixing every theoretical site without a CodeQL signal would be excessive. Left alone.
- **Degenerate `state={cond ? 'a' : 'a'}` ternaries** — emit 4 identical classes. Sub-optimal but correct. The compiler could detect and bail / use `_rsCollapse` instead; not worth the additional detector complexity for a vanishingly rare input.
- **`await` / `yield` inside cond expressions** — the compiler would emit `() => (await cond) ? 0 : 1` in a non-async arrow → syntax error. Extreme edge case (who awaits in a JSX attribute?), no real-corpus instance. Worth catching in the detector eventually but not urgent.

All three are documented here for the next reviewer.
