---
'@pyreon/rocketstyle': patch
'@pyreon/elements': patch
'@pyreon/kinetic': patch
---

perf(ui-system): batch() multi-signal writes + LRU-bound kinetic splitCache

Four hot multi-signal write sites previously notified subscribers twice per event. `batch()` collapses notify cycles to one per event:

- `@pyreon/rocketstyle` `createLocalProvider.ts` `onMouseLeave` — `hover` + `pressed` (fires on every styled-hover-state mouseleave).
- `@pyreon/rocketstyle` `usePseudoState.ts` `onMouseLeave` — `hover` + `pressed` (fires on every `usePseudoState` consumer).
- `@pyreon/elements` `Overlay/useOverlay.tsx` `hideContent` — `active` + `isContentLoaded` (fires on every overlay dismiss path).
- `@pyreon/elements` `Overlay/useOverlay.tsx` position recompute — `innerAlignX` + `innerAlignY` (fires on every scroll-driven recompute).

Doubling subscriber work per event compounds visibly on UIs with many overlay or styled-hover-state consumers; the change is invisible to single-signal consumers.

`@pyreon/kinetic` `utils.ts` `splitCache` was an unbounded `Map<string, string[]>` keyed by class-name strings — Class C leak per the anti-pattern catalog. Real-app inputs are stable per kinetic definition, but HMR cycles, dynamic theme generation, and A/B-tested variants can grow it without limit. Bounded at 128 entries with insertion-order eviction (matches `@pyreon/styler` `classCache`).
