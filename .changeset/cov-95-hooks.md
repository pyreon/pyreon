---
"@pyreon/hooks": patch
---

test(hooks): cover onUnmount cleanup paths across 7 hooks — 94.9 → 96.39

Adds `cleanup-paths-coverage.test.ts` that captures `onUnmount` callbacks
via a vitest mock, runs each hook, manually invokes the captured cleanup,
and asserts the cleanup side-effect (event listener removed, timer
cleared, throttle/debounce cancelled, effect stopped) actually happened.

Covers previously-uncovered cleanup bodies in `useEventListener`,
`useThrottledCallback`, `useDebouncedCallback`, `useTimeout`,
`useUpdateEffect`, plus the `useThemeValue` no-theme guard and
`useDebouncedValue` timer-clear path.

Hooks 94.9% → 96.39%; threshold bumped 94 → 95.
