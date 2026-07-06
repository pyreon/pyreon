---
'@pyreon/testing': minor
---

`@pyreon/testing` gains `renderHook` and two setup sub-entries. `renderHook(hook, { initialProps })` runs a Pyreon hook once in a probe component (Pyreon semantics — hooks run once) and exposes its return via `result.current`; `rerender(props)` updates a reactive props signal so `computed`/`effect` derivations re-run without re-invoking the hook. `@pyreon/testing/matchers` registers the `@testing-library/jest-dom` matchers (the complete, battle-tested set every Testing-Library user knows — `toBeInTheDocument`, `toBeVisible`, `toHaveAccessibleName`, `toBeChecked`, …) rather than a hand-rolled subset; `@pyreon/testing/vitest` is a `setupFiles` entry that also auto-registers `afterEach(cleanup)`. `@testing-library/jest-dom` is an optional peer dependency.
