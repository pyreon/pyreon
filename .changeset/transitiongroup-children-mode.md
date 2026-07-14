---
"@pyreon/runtime-dom": minor
"@pyreon/compiler": patch
---

`<TransitionGroup>` now additively supports a **children (container) shape** in
addition to the existing `items` / `keyFn` / `render` render-prop API: when no
`items` accessor is provided, it renders whatever keyed list it wraps (e.g. a
`<For>`) inside its container element, with the wrapped list owning keyed
reconciliation.

This is the shape PMTC lowers on native (`<TransitionGroup><For/></TransitionGroup>`
→ SwiftUI `VStack` + `.animation` / Compose `animateContentSize`), so a single
multi-platform `.tsx` now renders on web + iOS + Android. It fixes a web mount
crash where wrapping a `<For>` in `<TransitionGroup>` threw
`props.items is not a function` and the app never mounted. Existing
`items`/`keyFn`/`render` callers are unaffected; `items` supplied without
`keyFn`/`render` now dev-warns and degrades to the plain container instead of
throwing.
