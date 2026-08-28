---
'@pyreon/compiler': minor
'@pyreon/core': minor
'@pyreon/cli': minor
'@pyreon/vite-plugin': minor
'@pyreon/native-compiler': minor
---

Plain Mode follow-up tier: deep state, the classic→plain codemod, readiness report, Lens verdicts, and native-target support.

- **Deep state** — `let user = state({ … })` / `state([ … ])` (a literal object/array initializer) now lowers to `signal(createStore(...))`: member writes (`user.name = x`) and array mutations (`todos.push(t)`) notify with per-key granularity, whole reassignment replaces the store, and every JSX position stays live through the existing signal machinery. `state.raw(v)` opts a literal out to a shallow signal (replace-the-value semantics); non-literal initializers stay shallow — the split is static. Total tracking hoists conditional static member paths (`void (user().name);`), never a write target.
- **Codemod + readiness** — `pyreon plain [paths] [--write] [--json]`: per-binding classic→plain migration (`migrateToPlain` in `@pyreon/compiler`) whose dry-run is the readiness report with a declined-shape histogram. Object-literal signals convert to `state.raw(...)` — the codemod never changes semantics. A seeded round-trip fuzz oracle (classic → codemod → compile → behavioral DOM diff) locks both directions.
- **Reactivity Lens** — plain pre-pass warnings surface as `plain-mode` footgun findings in `analyzeReactivity`, at their source locations.
- **Native targets** — the PMTC compiler runs the same pre-pass via the new light `@pyreon/compiler/plain` subpath; a plain shared-source file emits byte-identical Swift/Compose to its classic twin.
- **Cross-module** — the vite-plugin signal-export registry now recognizes `state.raw(...)` exports; imported-state member-write warnings give conditional (deep vs shallow) guidance.
