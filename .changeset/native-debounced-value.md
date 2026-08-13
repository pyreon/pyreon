---
'@pyreon/native-compiler': minor
'@pyreon/native-cli': patch
---

Lower `useDebouncedValue` — a debounced field never updated on device

The call emitted verbatim, so a debounced search field compiled clean and
never updated.

The web contract was **measured before this emit was written**, because
"leading or trailing edge?" is exactly the question two native ports would
answer the same wrong way and agree with each other. Four properties, all
now asserted on the web side:

- the value is available IMMEDIATELY — no first-delay gap
- updates are TRAILING-edge
- a burst collapses to the LAST value
- the timer RESTARTS on each change rather than firing on a fixed cadence

That last one is what makes the lowering exact rather than approximate:
`.task(id:)` and `LaunchedEffect(key)` both cancel and restart when their key
changes, which IS a restarting trailing-edge debounce. No runtime, no stored
timer handle.

Two details that took a compile to find:

- The seed comes from the SOURCE SIGNAL's own initial, not the source
  property. A `@State` initializer runs before `self` exists, so
  `@State var d = query` is "cannot use instance member within property
  initializer" — and a type-default seed would leave the field empty for the
  whole delay on every mount, which the measured immediate-seed contract
  forbids.
- The element type is inferred at EMIT time, where the component's inference
  context knows the source signal's type. Parse-time inference produced
  `Any`, which breaks every use site.

The Swift stubs gained the id-keyed `task` overload — without it the stub
matched the un-keyed one and reported "extra trailing closure", rejecting a
correct emit. That is the stub-narrower-than-reality trap again.

Non-literal delays and block-body getters decline by name.

Note: the `kotlinx.coroutines.delay` stub and its conditional import also
appear in the `useInterval`/`useTimeout` PR. Either merge order resolves
trivially — both add the same three lines.
