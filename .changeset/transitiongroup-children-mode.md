---
"@pyreon/runtime-dom": minor
"@pyreon/vite-plugin": patch
"@pyreon/compiler": patch
---

`<TransitionGroup>` now works in shared multi-platform (`.tsx`) sources that
render on web + iOS + Android.

- `@pyreon/runtime-dom`'s `<TransitionGroup>` additively supports a **children
  (container) shape** in addition to the `items`/`keyFn`/`render` render-prop
  API: with no `items` accessor it renders whatever keyed list it wraps (e.g. a
  `<For>`) inside its container element. This is the shape PMTC lowers on native
  (SwiftUI `VStack` + `.animation` / Compose `animateContentSize`). Existing
  render-prop callers are unaffected; `items` without `keyFn`/`render` now
  dev-warns and degrades to the container instead of throwing.
- `@pyreon/vite-plugin`'s jsxAutoImport now supplies `TransitionGroup` from
  `@pyreon/runtime-dom` on web (same mechanism as `For`/`Show` from
  `@pyreon/core`), so a shared source uses the **bare** `<TransitionGroup>` tag
  with no import — critical because PMTC classifies any file that imports
  `@pyreon/runtime-dom` as web-only and skips its native emit.
- Adds a `diagnose` catalog entry for the two `<TransitionGroup>` web errors
  (`TransitionGroup is not defined`, `props.items is not a function`).

Fixes a web mount crash where wrapping a `<For>` in `<TransitionGroup>` threw
and the app never mounted.
