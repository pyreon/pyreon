---
'@pyreon/compiler': patch
---

Compiler hardening rounds 11–20 — two more real reactivity bugs fixed
(bisect-verified), plus regression locks for two proven gaps.

- R11 — signal auto-call was scope-blind. `autoCallSignals` inserted `()`
  after every active-signal-named identifier with a hand-rolled skip-list
  that did NOT cover callback parameter binding positions, and it walked the
  wrapped expression scope-blind. A destructured/plain callback param
  reusing a signal's name was wrongly auto-called:
  `const x = signal(0); [{x:1}].map(({x}) => <li>{x}</li>)` emitted
  `<li>{x()}</li>` — `x` is the map item (1) → `1()` runtime TypeError (the
  signal twin of the R2 prop-derived scope bug). Fixed: `findSignalIdents` is
  now block-accurate scope-aware (`scopeBoundSignals` + a `shadowed` set with
  enter/leave, mirroring R2's `findIdents`); legitimate non-shadowed signal
  reads still auto-call. The JS backend now converges onto the
  already-correct native backend (no new divergence).

- R13 — native-backend R7 residual. The resolution gate `accesses_props`
  (native/src/lib.rs) plus `collect_pd_in_stmt`'s statement coverage skipped
  prop-derived refs nested inside a callback whose body is a
  while/switch/try/labeled statement, so the production-preferred native
  backend silently under-inlined (`class={c}`) where JS inlined
  `class={(props.x)}` — reactivity lost. Fixed by completing the native
  statement-walker coverage with the same `pd_minus` scope-filter discipline
  (no shadowing-clobber regression); validated against all 180
  native-equivalence tests + full suite, binary rebuilt, bisect-verified.

- R12 — `transformJSX` emitted NO source map and its substitutions shift
  line counts (template emission expands one-line JSX into a multi-line
  `_tpl(...)` factory), and `@pyreon/vite-plugin` returned `{ code, map: null }`
  — so every runtime stack frame / debugger breakpoint in every Pyreon
  component mislocated app-wide. Fixed: `transformJSX_JS` now applies its
  existing disjoint `{start,end,text}` replacement set through MagicString
  (`update`/`appendLeft`) and the generated preamble via `prepend`;
  `toString()` is byte-identical to the prior concatenation (proven — the
  full ~1240-test suite + 180 native-equivalence tests assert exact emitted
  strings and stay green), while `generateMap()` yields a correct V3 map
  (`prepend` shifts every mapping by the preamble's line count, accounting
  for the line-shift). `@pyreon/vite-plugin` now returns that map. New
  `magic-string` direct dependency on `@pyreon/compiler` (already a
  transitive dep of the toolchain — +1 lockfile line, no new package in any
  install). Build-mode maps are exact; dev-mode HMR / signal-name injections
  add a small un-remapped offset (still vastly better than no map); the
  native backend still emits no map (its own scoped follow-up). Bisect-
  verified: neutralize the map production → the sourcemap specs fail while
  byte-identity stays green; restore → pass.

Still locked (proven, not yet fixed — scoped follow-up, no behavior change
here): R15 — a prop-derived-referencing element-valued const
(`const el=<i class={cls}/>`) diverges between backends (JS inlines+
duplicates the JSX reactively, native mounts the frozen const); carries a
self-discriminating `it.fails` lock that flips the moment the semantics are
unified.

No public API change. New tests only for the locks; the two fixes change
emitted code for the buggy shapes (correctness) and are byte-equivalent
across backends for everything else (R20 adds a JS↔Rust equivalence sweep
gate over the rounds-11–19 corpus).
