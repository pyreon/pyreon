---
'@pyreon/lint': minor
'@pyreon/atlas': patch
---

Two new lint rules for validated upstream-shipped bug shapes (97 → 99 rules):

- `pyreon/no-signal-read-in-attrs-callback` (styling, warn, dep-gated on `@pyreon/rocketstyle`): rocketstyle `.attrs()` callbacks run ONCE at setup, so a zero-arg call of a same-file signal/computed binding inside the callback captures a dead value that never updates (the ui-collapse-that-never-collapsed shape). Silent on `props.*`/`theme.*` reads, calls with args, the `.attrs({...})` object form, and handlers defined inside the callback; silent entirely in projects without `@pyreon/rocketstyle`.

- `pyreon/no-guard-only-signal-reads-in-effect` (reactivity, info): flags an `effect()` whose EVERY reactive read (tracked signal call or `props.X` read) sits behind a conditional whose own test is provably non-reactive (`if (ref.current) { chart.setOption(props.option) }`, incl. the early-return spelling) — the first run can short-circuit before any read, so the effect subscribes to nothing and never re-runs. Zero-FP construction: any unconditional proven OR possible read (an unclassifiable zero-arg call like `chart.instance()`), a reactive guard test, both-branch reads, loop-body reads, nested-callback reads, and switch/catch shapes all suppress the report.

`@pyreon/atlas`: the workbench preview's `dir`-applying effect now reads the `dir()` signal before the element guard — the previous shape subscribed only when the guard was truthy on the first run (it was in practice, since the effect is created after the element is captured, but the shape was fragile and is exactly what the new rule flags).
