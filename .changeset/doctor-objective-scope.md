---
'@pyreon/cli': minor
---

fix(cli): make `pyreon doctor` objective — scope health gates to first-party source

`pyreon doctor`'s `lint` / `react-patterns` / `pyreon-patterns` gates
scanned the WHOLE repo — example apps (intentionally framework-idiomatic,
incl. react-compat demos), `e2e/`/`docs/`/`scripts/`, detector
test-fixtures (which deliberately contain anti-patterns so the detectors
can be tested), and the `*-compat` packages (whose public API IS
React/Vue/etc. by design). That produced a meaningless F=55 where
~705/987 errors were examples + fixtures.

The fix wires the already-present (but only half-landed) objective-scope
helpers into all three gates: they now audit ONLY
`packages/<cat>/<pkg>/src/**` (the surface the project ships +
maintains), excluding tests/fixtures/`.d.ts`, and `react-patterns`
additionally skips `*-compat` src. Pure predicates
(`isFirstPartySourceFile` / `isCompatPackageFile`) are unit-tested +
bisect-load-bearing (a false-negative silently shrinks the audited set).

Companion: resolved the high-confidence subset of the now-visible
first-party `@pyreon/lint` backlog (these rules were never CI-enforced —
CI uses oxlint): documented-`.peek()` intentional-pattern annotations
(charts/permissions/table/rx), per-field signal-allocation-at-setup
annotations (form/state-tree — the documented fine-grained architecture,
not the render-loop anti-pattern), the always-on unhandled-effect-error
reporter annotation (reactivity), and `.pyreonlintrc.json`
`no-window-in-ssr` exemptPaths for the private never-SSR dev/test infra
`internals/perf-harness` + `internals/test-utils` (same rationale as the
existing `runtime-dom` exemption). Objective errors: 69 → 33.
