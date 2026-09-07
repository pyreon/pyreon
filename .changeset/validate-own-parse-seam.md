---
'@pyreon/validate': patch
---

A pure-JIT schema installs `parse` as an own property after its first parse.

The prototype `parse` (#3316) is already two field loads, one call, one
`issues.length` read and a `Result` literal, and still sat over the emitted
validator alone: its `this` loads go through a many-field instance and its
call target is monomorphic only per process. A closure that captures the
compiled artifact and its reused ctx, installed as the instance's OWN `parse`,
has neither cost. It is built in the same pass as the artifact it closes over
and deleted with it on invalidation (a chained method after use), so the two
cannot disagree; a non-pure tree keeps the prototype method and a subclass
override is left alone.

Measured on the process-isolated four-cell runner (load 2.9, three rounds,
median-of-medians): `number.int.range` 5.02 → 4.65 / 4.61 ns across two runs
(1.82× → 1.67× against zod's compiled parser); `du.3-member`,
`object.array-of-objects` and `array.20-objects` unchanged within noise.
