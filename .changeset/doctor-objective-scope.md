---
'@pyreon/cli': minor
'@pyreon/compiler': patch
'@pyreon/lint': patch
'@pyreon/core': patch
'@pyreon/head': patch
'@pyreon/styler': patch
'@pyreon/hotkeys': patch
'@pyreon/flow': patch
'@pyreon/ui-core': patch
---

fix: make `pyreon doctor` objective + close the real first-party findings it then surfaced

`pyreon doctor` reported a meaningless **F (score 55, 987 errors)** because
its `lint` / `react-patterns` / `pyreon-patterns` gates scanned the WHOLE
repo: example apps (intentionally framework-idiomatic, incl. react-compat
demos), `e2e/`/`docs/`/`scripts/`, detector test-fixtures (which
*deliberately* contain anti-patterns so the detectors can be tested), and
the `*-compat` packages (whose public API IS React/Vue/etc. by design).
~705/987 errors were examples + fixtures; the rest a never-CI-enforced
advisory backlog or by-design.

**Objectivity (the deliverable):** the three gates now audit ONLY
first-party published source — `packages/<cat>/<pkg>/src/**`, excluding
tests/fixtures/`.d.ts` — via pure, unit-tested predicates
(`isFirstPartySourceFile` / `isCompatPackageFile`); `react-patterns`
additionally skips `*-compat` src (a React-API shim containing `useState`
is a definitional false positive). Errors **987 → 86**.

**Detector precision (false positives are the antithesis of objective):**
- `@pyreon/compiler` `dot-value-signal`: now requires the receiver to be a
  tracked signal binding — no longer flags `input.value` / `cell.value` /
  `o.value` (17 FPs; bisect-verified).
- `@pyreon/lint` `no-window-in-ssr`: recognizes field-captured typeof
  (`this.isSSR = typeof document === 'undefined'`) and function-head
  early-return guards covering nested closures (bisect-verified).
- `@pyreon/lint` `no-bare-signal-in-jsx`: now supports `exemptPaths`
  (consistent with the other exemptable rules) — render-function
  primitives read signals in JSX *attribute* positions which the compiler
  `_rp()`-wraps; the text-position heuristic over-fired there.

**Genuine first-party SSR bugs fixed** (the rule correctly did NOT silence
these — cross-function/method guards aren't lexically traceable):
- `@pyreon/head` `createNewTag` — added `typeof document` guard.
- `@pyreon/styler` `Sheet.mount()` — in-method `if (this.isSSR) return`.
- `@pyreon/hotkeys` `detachListener` — `typeof window` guard.
- `@pyreon/flow` flow-component — guarded `new ResizeObserver` with
  `typeof ResizeObserver === 'function'`.
- `@pyreon/core` lifecycle — renamed a local `location` shadowing the
  browser global (hygiene; also removed an SSR-analysis false positive).

**Curated `.pyreonlintrc.json`** exemptions (with rationale) for
genuinely-non-SSR-runtime surfaces: `@pyreon/compiler` (build-time Node)
and `*-compat` (DOM-runtime framework adapters, consistent with the
existing `runtime-dom` exemption) for `no-window-in-ssr`; `*-compat` for
`dev-guard-warnings` (intentional user-facing "[Pyreon] X not supported"
guidance that must reach prod).

**Result: errors 987 → 1.** The single remaining `no-window-in-ssr` in
`@pyreon/ui-core` (`_isBrowser && matchMedia(...)`) is provably SSR-safe
(short-circuit; `_isBrowser` is a `typeof`-AND const) — a documented
known rule-precision limitation, left visible (NOT exempted: silencing it
would hide future *real* ui-core SSR bugs — anti-objective).

Verified: 8 touched packages, 3091 unit tests pass; typecheck clean;
full-repo `oxlint` 0 errors; e2e 127 specs pass (default 92 +
ui-regression 26 + app-showcase 9); each detector change bisect-verified.
