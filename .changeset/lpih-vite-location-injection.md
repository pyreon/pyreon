---
'@pyreon/reactivity': minor
'@pyreon/vite-plugin': minor
---

LPIH: build-time source-location injection via `@pyreon/vite-plugin`. Eliminates the runtime `new Error().stack` capture cost (~2.2 µs per signal creation) by embedding the source location as a compile-time literal.

**Before** (foundation PR):

```ts
// User source:
const count = signal(0)

// Runtime, when devtools active:
// 1. new Error() + parse stack → ~2.2µs cost per creation
// 2. Use parsed location for LPIH source-location capture
```

**After** (this PR):

```ts
// User source (unchanged):
const count = signal(0)

// Vite-transformed source (dev mode):
const count = signal(0, {
  name: "count",
  __sourceLocation: { file: "app.tsx", line: 5, col: 14 }
})

// Runtime, when devtools active:
// 1. Read options.__sourceLocation → ~0ns cost
// 2. Use injected location directly — stack capture skipped
```

**`@pyreon/reactivity`**:

- `SignalOptions.__sourceLocation?: { file, line, col }` — new optional field (marked `@internal`, not part of the public API surface). When present, the runtime uses it directly and skips `_captureCallerLocation()` entirely.
- 2 new tests proving the injected option is preferred over stack capture + the fallback still works when the option is absent.

**`@pyreon/vite-plugin`**:

- Extended `injectSignalNames` to ALSO inject `__sourceLocation` alongside the existing `name` field. Same regex, same transform pass — additive change.
- New helpers `_computeLineStarts(code)` + `_offsetToLineCol(offset, starts)` — O(N) precompute + O(log N) per-signal binary search. Avoids O(N²) when many signals share a file.
- The injected `file` is Vite's resolved module ID (absolute path) — the same path the runtime would have parsed from `new Error().stack`, so byte-identical behavior except for cost.
- 15 new tests covering line/col math + injection at function-scope call sites + the 5 skip-cases (existing options, non-signal calls, multiline args, no-injection-for-doSomething, etc.).

**Known limitation**: module-scope signals (`export const x = signal(0)`) get rewritten to `__hmr_signal()` first by the existing HMR injection pass. The location injection runs after and naturally skips them (regex matches `signal(` not `__hmr_signal(`). Module-scope signals still pay the runtime stack-capture cost. Function-scope signals (the dominant pattern in real Pyreon apps — signals declared inside components) get the full benefit. Module-scope follow-up tracked.

**Tests** (+17 new across 2 packages, 481 total green):

- `@pyreon/reactivity`: 362 (+2 — injected-location-preferred + stack-fallback-when-absent)
- `@pyreon/vite-plugin`: 119 (+15 — line-starts utility, offset-to-line-col, 6 injection scenarios, existing-options skip, non-signal skip, multiline args)

**Performance**:

- Runtime cost (devtools active, function-scope signal): **0 ns** stack capture (was ~2.2 µs)
- Build-time cost: ~10 µs per signal call site (one regex match + one binary search + ~80 bytes of literal output) — invisible on real-world builds
- Bundle-budget impact: 0 (transform happens in dev-mode-only Vite plugin code path; no production bundle growth)

**Bisect-verified**: removing the `__sourceLocation` literal from the injection emission makes the line/col-correctness tests fail with "expected to include `__sourceLocation`"; the runtime-side `signal() prefers __sourceLocation over stack capture` test verifies the runtime fast-path is actually wired (file path comes from the injected option, not the test file).

This closes R4 from the [LPIH recommendations](https://github.com/pyreon/pyreon/blob/main/.claude/experiments/RECOMMENDATIONS.md). The 2.2 µs/creation overhead in the foundation PR's measurement is now eliminated for the majority of real-world signals.
