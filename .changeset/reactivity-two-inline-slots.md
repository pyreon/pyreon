---
'@pyreon/reactivity': patch
---

Two inline tracking subscribers before a Set, and hash-free effect teardown.

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
11 arms interleaved): the benched shape 60.8 → ~20 µs on-CPU and 95 → ~36 µs
wall, against SolidJS at ~15 / ~27 in the same runs — the 3.3× gap on that
scenario becomes ~1.35×. Retained heap per signal unchanged (152 B).
