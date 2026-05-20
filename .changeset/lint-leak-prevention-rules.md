---
'@pyreon/lint': minor
---

feat(lint): two new preventative rules distilled from the #725 → #741 leak-class sweep

Adds two preventative lint rules — `pyreon/promise-race-needs-cleartimeout`
(performance) and `pyreon/init-fn-needs-idempotency` (lifecycle) — that
would have caught the structural bugs fixed across the 8-PR leak-class
sweep (#725, #729, #730, #733, #734, #735, #737, #739, #741) BEFORE
they shipped.

### 1. `pyreon/promise-race-needs-cleartimeout` (performance, warn)

Flags `Promise.race([work, new Promise((_, reject) => setTimeout(reject,
MS))])` inside a try block where the enclosing `finally` block does NOT
contain a `clearTimeout` call. The bug class: when `work` wins the race
(the success path — every healthy invocation), the rejection branch's
setTimeout fires later, pinning a closure + reject callback for up to
MS ms. Under sustained traffic, hundreds of pending timers pile up.

**Caught real cases (would have surfaced at edit time)**:

- #734 — `@pyreon/zero` `isr.ts revalidate()` — 30s setTimeout per
  successful revalidation, hundreds piled up under load.
- #735 — `@pyreon/zero` `ssg-plugin.ts` per-path render + per-locale
  404 render (×2), 30s setTimeout per successful render.

**Heuristic**: targets the canonical `new Promise((_, reject) =>
setTimeout(...))` shape used in every real case. Conservative — doesn't
attempt to detect anonymous-arrow setTimeouts deeply nested in arbitrary
arguments.

**Tests (7 specs)**: 3 FIRES (canonical, no-finally, multi-line) + 4
DOES-NOT-FIRE (clearTimeout present, no setTimeout branch, plain
setTimeout outside race, no try/catch). **Bisect-verified**: disabled
the `TryStatement` visitor body → 3 FIRES specs fail with `expected
[] to include 'pyreon/promise-race-needs-cleartimeout'`. Restored →
7/7 pass.

### 2. `pyreon/init-fn-needs-idempotency` (lifecycle, warn)

Flags an exported `init*` function that:
1. Has at least one `onMount(...)` call in its body.
2. Is ALSO called from another function in the SAME module.
3. Lacks a module-level refcount / boolean guard variable
   (`let _x = 0` / `let _flag = false` / `let _disposeShared = null`).

**Caught real case**:

- #734 — `@pyreon/zero` `initTheme()` ThemeToggle pile-up. `initTheme`
  was exported from `theme.tsx` AND called from `ThemeToggle`'s render
  body, with no refcount guard. Every mounted ThemeToggle registered a
  fresh matchMedia listener + effect (N components → N listeners).

**Conservative by construction (deliberate FN tolerance)**:

- Same-module call requirement means cross-module reentrancy is out of
  scope (would need a full project scan, way beyond per-file lint).
  Legit one-shot inits (`initApp()` exported and called only from a
  separate entry file) don't fire.
- Guard detection looks for module-level `let X = 0|false|null` — the
  refcount / flag patterns the playbook PRs used. A WeakMap-keyed
  dedup wouldn't match, but that's an acceptable false negative.
- Name pattern `/^init[A-Z]/` only — `useX` / `setupX` / lowercase
  function names skip the rule (those have different semantics in
  Pyreon's component conventions).

**Tests (7 specs)**: 2 FIRES (#734 shape, multi-callsite) + 5
DOES-NOT-FIRE (refcount guard, boolean guard, one-shot init with no
same-module call, useX hook, init with no onMount). **Bisect-verified**:
disabled the `Program` visitor's report loop → 2 FIRES specs fail
with `expected [] to include 'pyreon/init-fn-needs-idempotency'`.
Restored → 7/7 pass.

### Validation

- `@pyreon/lint` 653/653 tests pass (+14 new — 7 per new rule)
- Lint + typecheck clean
- Manifest + CLAUDE.md + lint README + lint docs updated to 82 rules /
  18 categories (lifecycle 5→6, performance 5→6)
- Doc-claims gate clean (`bun run check-doc-claims`)
- Generated llms.txt / llms-full.txt / MCP api-reference regenerated
  via `bun run gen-docs`
- Both rules ship as `warn` severity, present in the `recommended`
  preset by default (matches every other performance/lifecycle rule)

### Closes the systemic-prevention arm of #733/#734's follow-up sweep

The fixes-side of the audit-byproducts trail closed in #735, #737,
#739, #741 (the 4 MEDIUM patterns from #733+#734's audit). These two
rules close the PREVENTION-side — going forward, the same bug shapes
fail at edit time instead of shipping.

Other rule categories the audit surfaced but didn't bottom out:

- "Wrapper-callable forwards .direct without _v" — already covered
  by `pyreon/storage-signal-v-forwarding` (existing rule).
- "Module-level mutable cross-request bleed" (the csp.ts pattern) —
  too context-dependent to detect statically without high FP rates.
  Documented in `.claude/rules/anti-patterns.md` as a manual checklist.
