---
'@pyreon/reactivity': minor
---

feat(reactivity): Reactive Coverage — "which reactive edges never fired?"

New `@pyreon/reactivity/coverage` subpath. Code coverage tells you a *line* ran; Reactive Coverage tells you a *reactive update fired*. Run your tests, then see every signal / computed / effect whose reactive behaviour was **never exercised** — dead reactivity (a signal nobody changes, an effect that only runs at mount) or an untested reactive path. No other framework has a name for this; Pyreon can measure it because the runtime already holds a precise model of the reactive graph (the always-on dev registry that powers LPIH).

**API** (dev/test only — tree-shaken in production):

- `startReactiveCoverage()` / `takeReactiveCoverage(): ReactiveCoverageReport` / `stopReactiveCoverage()` — session helpers. `start` resets a clean baseline, pins nodes so an unmounting component isn't GC-pruned out of the denominator, and enables reads.
- `computeReactiveCoverage(nodes)` — the pure function behind the report (feed it `getReactiveGraph().nodes`); `classifyReactiveNode(node)` — the single-node classifier; `formatReactiveCoverage(report, opts?)` — a dependency-free text renderer.

**Coverage is kind-aware.** A "fire" is a value-changing signal write / computed recompute / effect run (the initial run counts): signals are covered when they change (`fires ≥ 1`); effects and computeds are covered only when they RE-run past their mount run (`fires ≥ 2`). The `ran-once` reason flags a mounted effect/computed whose reactive re-run was never triggered — a reactive behaviour your suite never exercised, which a line-coverage tool reports as 100%.

Try it: `bun scripts/demo-reactive-coverage.ts`.
