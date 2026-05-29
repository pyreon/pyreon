---
'@pyreon/elements': patch
---

perf(elements): intern Content's `$element` bundle so compound-Element slots hit `elClassCache`

The Content helper (the compound `beforeContent` / `afterContent` path) was the one `$element` consumer not routed through `internElementBundle()` — it allocated a fresh bundle object per mount, so the styler's identity-keyed `elClassCache` missed every time and ran a full `styler.resolve` per Content slot per mount. The Element fast path and Wrapper's 4 paths already intern; Content now matches them.

`internElementBundle` bails (returns the input unchanged) on function/object values, so the `extraStyles` (CSSResult/callback) case keeps today's exact behavior. Bisect-verified: 20 identical compound Elements drop from **183** `styler.resolve` calls to **<20** (`__tests__/content-intern.test.tsx`); 497/497 existing elements tests pass (behavior unchanged).
