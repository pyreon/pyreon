---
"@pyreon/elements": patch
---

test(elements): remove cosmetic v8-ignore annotations; honest threshold

Removes the 18 `/* v8 ignore */` annotations introduced by PR #1299 across 6 files. The pre-cosmetic baseline was already strong at 91.27% branches — the v8-ignores existed only to lift the gate to 95%.

Coverage trajectory:
- Pre-PR-1299 baseline: 91.27% branches
- PR #1299 (cosmetic): 96.19% via v8-ignores (gaming the gate)
- Now: 91.27% branches via removal (no real-test change)

Threshold lowered from 95 → 91. The remaining ~37 uncov branches are defensive guards in Element's equalize layout effect (ResizeObserver fallback paths), useOverlay dev-mode warns + positioning fallbacks, and Iterator/Wrapper optional-prop arms. These are exercised by `elements.browser.test.tsx` + ui-showcase e2e in a real browser; vitest measures unit-test-process coverage only.
