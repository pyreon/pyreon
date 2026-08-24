---
'@pyreon/native-compiler': patch
---

`<RouterLink>` emitted an unresolvable tag on both native targets

`<RouterLink to="/x">` from `@pyreon/router` is the same concept as `<Link>` and
carries the same prop, but it had no entry in either emitter's tag dispatch, so
it fell through to the unknown-tag path:

```swift
RouterLink(to: "/about") { … }   // no such type; the runtime ships PyreonLink
```

It now maps to `PyreonLink` on both targets, which `<Link>` already did.

Found by compiling every native-coverage registry snippet on real `swiftc`:
9 of 31 did not build. The gate judges a package by TRANSFORM WARNINGS and never
compiles the emit, so a warning-free uncompilable emit reads as "crosses".

Also corrects the `@pyreon/styler` registry snippet, which used the call form
`styled('div', {…})`. That is not the lowering shape — the parser requires a
tagged template over a canonical primitive, and the call form fell through
BEFORE the existing non-canonical warning, emitting `styled("div", …)` verbatim
with no warning at all. The real shape emits `VStack` and typechecks.

Registry snippets compiling on real swiftc: 22/31 → 24/31.
