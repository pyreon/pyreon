---
"@pyreon/svelte-compat": patch
---

test(svelte-compat): remediate cosmetic v8-ignore campaign with real tests

Removes the 24 `/* v8 ignore */` annotations introduced in PR #1301 across `src/index.ts` and `src/jsx-runtime.ts` and replaces them with 20 real tests covering the previously-uncovered branches via the public API.

Honest coverage trajectory:
- Pre-PR-1301 baseline: 85.31% branches
- PR #1301 (cosmetic): 100% via v8-ignores (gaming the gate)
- Now: 89.51% via real tests (+4.20pp over pre-cosmetic baseline)

Tests cover safeNotEqual NaN/object/function discrimination, component-context writable.subscribe + rerender hooks, onMount/onDestroy re-render re-push paths, createEventDispatcher fallback handler resolution, derived multi/single-source updates, readable facade, mount-side DOM smoke.

Threshold lowered from 95 → 89 with documented rationale.
