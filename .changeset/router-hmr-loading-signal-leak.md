---
'@pyreon/router': patch
---

HMR coordinator no longer leaks into `_loadingSignal` (PR-S8)

**Pattern C from the deep-audit campaign** (async cleanup race — counter incremented but never decremented). Pre-PR-S8 the dev-only `_hmrSwap` coordinator bumped `_loadingSignal.update((n) => n + 1)` after each successful component-cache swap to force `RouterView`'s `depthEntry` computed to re-emit. But the bump was never paired with a `n - 1` — so `loading() > 0` (i.e. `useTransition()` / `router.loading()`) was STUCK `true` for the page lifetime after the first HMR swap. Visible to users via permanently-active loading indicators or always-pending transition states in dev.

Originally surfaced in PR #783-era HMR work; the asymmetry was hidden because nothing read `loadingSignal` after the bump in test environments. Real-app development sessions saw the bug after the first edit.

**The fix**: a dedicated `_hmrTick` signal that `depthEntry` subscribes to alongside `_loadingSignal`. HMR bumps `_hmrTick`; navigation bumps `_loadingSignal`; the two never interfere. The category-confusion fix is structural — a navigation-loading signal is for navigation lifecycle (paired start/end counters), repurposing it for "force re-emit a downstream computed" was the original mistake.

New `RouterInstance._hmrTick?: Signal<number>` field — optional because production builds tree-shake `_hmrSwap` (which is the only writer); `depthEntry` reads via `router._hmrTick?.()` to no-op gracefully in prod. `depthEntry`'s subscription order is `_loadingSignal()` then `_hmrTick?.()` — both subscriptions track for re-emission triggers.

**Regression coverage**: 3 new tests in `router.loading` describe block in `router.test.ts` (`_hmrSwap does NOT leak into _loadingSignal`, `_hmrTick is a separate counter from _loadingSignal`, `multiple HMR swaps don't accumulate in _loadingSignal`). Bisect-verified: reverting `router.ts` + `components.tsx` + `types.ts` to the pre-fix state fails all 3 with the documented error messages. Restored → 546/546 router tests pass.

**No public API change**: `_hmrTick` is `@internal` (prefixed with `_`, same convention as `_loadingSignal` / `_hmrSwap`). `RouterView`'s public behavior is unchanged. Production builds are byte-identical except for the new tree-shaken-out HMR coordinator.
