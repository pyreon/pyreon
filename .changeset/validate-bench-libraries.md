---
'@pyreon/validate': patch
---

Validation benchmark extended to six libraries (seven entries), two axes, and a fixed
measurement-validity bug.

Zod 4.5 shipped `z.compile()` — a `new Function` codegen path — so the suite now
measures `zod-c` alongside interpreted `zod`, plus `@sinclair/typebox`
(`TypeCompiler`), `yup` and `joi`. Zod is bumped 4.4.3 → 4.5.4 repo-wide.

Two axes, because these libraries do not all return the same thing. `parse` produces
a validated output value; `check` is a boolean verdict through each library's
cheapest such API. TypeBox has no output-producing equivalent, so it runs only the
`check` axis rather than being given a cheaper call and scored against it; Zod has no
boolean-only API, so its `check` cells run a full `safeParse()` — both disclosed in
the printed footer. Setup cost (schema construction plus any ahead-of-time compile)
is reported separately, since an AOT compiler buys steady-state speed with a one-off
cost a cold invocation may never amortize.

MEASUREMENT-VALIDITY FIX: every scenario now rotates over a pool of distinct inputs.
With one constant input the call is loop-invariant and V8 may hoist it out of the
timed loop — ArkType's `string.email` cell read ~3ns/op, below the cost of the regex
test the check has to perform, while libraries V8 could not hoist kept reporting
their real ~28ns. The table was ranking inlinability, not speed. A result sink does
not fix this (a hoisted value still satisfies it); only varying the input does.

Also fixed: processes are now ROUND-ROBINED across the libraries in a row rather than
run cell-consecutively. A load burst outlasts a single cell, so the old schedule let one
land entirely on one library — observed as a Pyreon cell reading 155ns against its own
5ns on the interleaved schedule. And the "setup cost" table measured shared scenario
construction (all nine columns read ~1.4ms); it now reports only the explicit compile
CALL — `z.compile()` ~55µs, `TypeCompiler.Compile()` ~48µs — and `—` for the libraries
that compile lazily or at definition time, rather than a number measuring something else
for them.
