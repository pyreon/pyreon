---
'@pyreon/compiler': patch
---

Compiler no longer emits a wasteful per-row `_bind()` renderEffect for static item-property reads inside `<For>`/`<Index>`/render-callback children. A render callback's first parameter (`<For>{(row) => …}</For>`) is a runtime ITEM the framework passes per row, NOT reactive component props — so a bare property read like `{String(row.id)}` is provably static (Pyreon reactivity is via signal CALLS, e.g. `row.label()`) and is now baked as a one-time `textContent =` assignment instead of a `_bind(() => …)` effect.

Previously `maybeRegisterComponentProps` registered the callback's first param as reactive props (because the callback returns JSX), making every bare item-property read look reactive. For a 1,000–10,000-row list that meant 1,000–10,000 unnecessary `renderEffect` allocations + disposer closures, each retained until the row unmounts — a real per-row CPU + retained-heap cost. Signal-valued item reads (`row.label()`, `() => row.x`) and real components (`function Row(props) { return <td>{props.x}</td> }`) are unaffected and stay reactive.

Fixed in both the JS and Rust (native) backends — byte-identical output, all cross-backend equivalence tests pass. Attribute-value render functions (`component={(p) => …}`) are NOT affected (they can be real inline components receiving props).
