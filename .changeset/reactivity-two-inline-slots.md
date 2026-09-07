---
'@pyreon/reactivity': patch
'@pyreon/runtime-dom': patch
---

Two inline tracking subscribers before a Set, hash-free effect teardown, and
unit teardown for a compiled slot's static children.

`@pyreon/runtime-dom`: a compiled `<div>{children}</div>` lowers to
`_mountSlot(children, el, placeholder)`, and when `children` is a static
value (an array of row VNodes, not an accessor) every row element used to
receive its own DOM remover, so disposing a 500-row list removed 500 nodes one
by one before dropping the container that already contained them. A static
slot value is part of the clone and leaves with it, so it now mounts under the
same "removed as a unit" contract the clone's own children have
(`mountChildAsUnit`): effects are still disposed, DOM removal is left to the
clone. An accessor slot is unchanged — it is a reactive boundary that must
clear its own range on every flip. Same treatment for `_mountChild`'s
non-accessor absorbed-component case.

A signal or computed now keeps its first TWO tracking subscribers inline and
promotes to a `Set` only on the third. The second lives in the existing `_s`
field as a FUNCTION (a `Set` there still means ≥3), so a signal grows by no
property — an extra field measured +24 B per signal under V8's in-object
slack, which on a 10k-row page is the whole retained-heap margin the board
tracks. The one-slot census counted flat row lists and computed chains, where
a source has exactly one subscriber; a list row that owns an `effect()` AND a
text bind on its own signal — the dispose-500 scenario, and any row with a
derived side effect — has exactly two, and paid a hashed `Set.delete` per
subscriber per dispose. With two inline subscribers a write routes through
the pending queues exactly as a promoted Set does (the two-tier drain keeps a
`{ equals }` computed ahead of an effect that reads it; a listener added or
removed by the first callback follows the same cap-iteration rule), so
ordering is unchanged; a single subscriber keeps the direct dispatch.

Effect, render-effect and `_bind` disposers also stop truncating their dep
array with `deps.length = 0` for the one-dep case (a length-setter store V8
takes slowly) and `pop()` instead.

Any code that reads `_s` as a Set must now handle the function form — use
`_hasSubscribers` / `_tierCount` from `@pyreon/reactivity` rather than
touching the field (the in-repo readers — devtools graph, `debug()`,
`createSelector`, the store's sole-subscriber swap — are updated).

Measured on the dispose-500 ablation ladder (real Chromium, CDP attribution,
the board's exact shape as its own arm): 60.8 → 15.6 µs on-CPU and 95 → 27.8 µs
wall, against SolidJS at 14.7 / 26.3 in the same runs. On the scenario board
the op reads Pyreon 40 µs vs Solid 35 µs with overlapping CI95 (was 115 µs,
3.29×). Retained heap per signal unchanged (152 B).
