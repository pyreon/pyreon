---
'@pyreon/core': minor
'@pyreon/hooks': patch
---

Move `useControllableState` to `@pyreon/core`, where it belongs.

It is a PROPS primitive, not a hook: it reads a props accessor, owns no
lifecycle, and is used in the same breath as core's `splitProps` — every
consumer already wrote both imports side by side. It imports nothing but
`signal`.

Its previous home in `@pyreon/hooks` meant any package wanting the
controlled/uncontrolled pattern had to depend on hooks — and hooks depends on
`@pyreon/styler` + `@pyreon/ui-core`. That dragged the entire UI-system styling
layer plus 40+ unrelated hooks (`useFetch`/`useHaptics`/`useShare`/…) into the
consumer for ~20 lines. `@pyreon/elements` needs the pattern and sits BELOW
those packages, so the edge would also have inverted the layering.

`@pyreon/hooks` re-exports it, so its public API is unchanged — the same
cross-layer idiom `@pyreon/core` already uses for reactivity's
`isClient`/`isServer`. No consumer needs to change an import.
