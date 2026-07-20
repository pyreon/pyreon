---
"@pyreon/hooks": minor
"@pyreon/ui-core": minor
---

refactor(hooks,ui-core): make @pyreon/hooks independent of the ui-system layer

`@pyreon/hooks` is a **fundamentals** package but depended on the **ui-system**
layer (`@pyreon/styler` + `@pyreon/ui-core`), which inverted the layer order and
dragged the whole styling layer into every hooks consumer. It is now fully
independent — its only `@pyreon/*` deps are the `core` + `reactivity` peers.

**Breaking** — three theme-reader hooks moved from `@pyreon/hooks` to
`@pyreon/ui-core` (their natural home: they read the styler theme, and the
ui-system now owns its theme hooks):

- `useThemeValue` — import from `@pyreon/ui-core` instead of `@pyreon/hooks`
- `useRootSize` — import from `@pyreon/ui-core`
- `useSpacing` — import from `@pyreon/ui-core`

`useThrottledCallback` stays in `@pyreon/hooks` (its `throttle` util is now
inlined — identical leading+trailing behavior, no ui-core import). All other
hooks are unchanged.

This severs the last `fundamentals → ui-system` runtime dependency edge, a step
toward making the ui-system and fundamentals layers mutually independent.
