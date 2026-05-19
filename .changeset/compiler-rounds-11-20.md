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

Also locked (proven, not yet fixed — scoped follow-ups, no behavior change
here): R12 — `transformJSX` emits no sourcemap and substitutions shift line
counts (`@pyreon/vite-plugin` returns `map:null`), so stack traces /
breakpoints in components mislocate app-wide; R15 — a prop-derived-
referencing element-valued const (`const el=<i class={cls}/>`) diverges
between backends (JS inlines+duplicates the JSX reactively, native mounts the
frozen const). Both carry self-discriminating `it.fails` locks that flip the
moment the underlying semantics are unified.

No public API change. New tests only for the locks; the two fixes change
emitted code for the buggy shapes (correctness) and are byte-equivalent
across backends for everything else (R20 adds a JS↔Rust equivalence sweep
gate over the rounds-11–19 corpus).
