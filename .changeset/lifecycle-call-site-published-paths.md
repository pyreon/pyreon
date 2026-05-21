---
'@pyreon/core': patch
---

`captureCallSite` (the "Called from:" hint emitted with `onMount() / onUnmount() / onUpdate() called outside component setup` warnings) now skips published-bundle paths AND function-name matches, not just source-tree paths.

**The bug**: pre-fix the skip patterns only matched workspace source paths (`/lifecycle\.ts/`, `/\/core\/src\//`, etc.). Published packages bundle to `node_modules/@pyreon/<name>/lib/index.js`, so for npm consumers (i.e. almost everyone in production dev) the framework's own stack frames slipped through the filter. The walker returned the first non-`<anonymous>` `at` line — which was `captureCallSite` itself or `warnOutsideSetup` — making every warning's "Called from:" line point at the warning emitter instead of the actual user/framework call site.

Net result: the diagnostic that was supposed to make these warnings actionable was broken across every published consumer.

**The fix**:
- Skip `/\/lifecycle\.[tj]s/` (covers `.ts` source AND `.js` bundles)
- Skip `/\bcaptureCallSite\b/` and `/\bwarnOutsideSetup\b/` (function-name match — survives bundling)
- Skip `/\/(core|reactivity|runtime-dom|runtime-server|router|head|ui-core|styler|unistyle|rocketstyle|attrs|elements|kinetic)\/src\//` for every framework package that internally calls lifecycle hooks
- Skip `/node_modules\/@pyreon\/[^/]+\/lib\//` AND `/@pyreon\/[a-z-]+\/lib\//` — the published-bundle blanket

The first source `.ts` only patterns are kept for safety; the new matchers stack on top so workspace and published consumers BOTH get the right call-site hint now. User-installed third-party packages outside `@pyreon/*` are NOT silenced — only framework code is filtered.

Bisect-verified: reverting the patterns to the pre-fix shape (src-only, no function-name match) fails 3 of the 8 new regression tests in `lifecycle.test.ts` (`skips published-bundle lib paths`, `skips workspace source paths`, `skips the warning infrastructure itself`). Restored → 531/531 `@pyreon/core` tests pass + no `TEMP BISECT` remnants.

Long-standing bug — the source-path-only filter has been in `lifecycle.ts` since at least 0.20.0. It just hadn't been a complaint because no high-frequency warning path was hitting it before the dev 404 fix in 0.24.1 (#792) exposed every Vite dev iteration to provider re-renders.
