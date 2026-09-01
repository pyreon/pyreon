---
'@pyreon/native-compiler': patch
---

PMTC inference-seeding fixes the charts engine surfaced: helper return types now reach the module-level inference contexts (a top-level helper's `const step = niceStep(...)` seeded unknown, so every type-gated lowering downstream went dark); local seeding falls back to the ANNOTATION when an initializer infers unknown; struct initializers coerce an Int-valued argument into a Float-typed field on BOTH targets (`Tick(value: i)` over a loop counter — neither Swift memberwise inits nor Kotlin named args widen); and every closure/handler body seeds BOTH inference contexts (two sites — the tick-handler and the returned-closure arrow — seeded only one, leaving closure locals invisible to type-gated lowerings; one site double-seeded with a leaking restore, now deduped). Annotated closure params also bind into the inference contexts (the reveal-closure shape: a param-typed receiver could not coerce its comparisons).
