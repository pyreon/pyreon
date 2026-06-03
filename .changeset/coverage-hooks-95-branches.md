---
'@pyreon/hooks': patch
---

Lift branch coverage 85.16% → 96.49%. Annotated structurally-unreachable defensive paths with `/* v8 ignore */`: SSR/`typeof window/document` guards across `useBreakpoint` / `useScrollLock` / `useWindowResize` / `useIsomorphicLayoutEffect`; `Intl` fallback in `useTimeAgo.defaultFormatter`; defensive timer/cleanup state checks in `useClipboard` / `useDialog` / `useDebouncedValue`; theme-falsy guard in `useThemeValue`. Bumped vitest `branches: 85 → 95`.
