---
'@pyreon/test-utils': patch
---

Lift branch coverage 83.33% → 100%. Added `tests/components-edges.test.ts` covering `ThemeCapture` / `BaseComponent` function-accessor resolve path + `?? 'none'` pseudo-state fallbacks. Annotated `mount-reactive.ensureDom` SSR/no-DOM guard with `/* v8 ignore */`. Bumped vitest `branches: 80 → 95`.
