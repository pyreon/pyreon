# P0 RFC — rocketstyle compiler-pass collapse: design decisions + vertical slice

**Status**: design-decision spike (no runtime code). Resolves the 4 open
questions from `open-work-2026-q3.md` §P0 and scopes the smallest
end-to-end vertical slice. **This document gates Phase 1** — implementation
does not start until these decisions are approved.

**Grounding** (already measured, do not re-run):
- E2 (`examples/experiments/e2-static-rocketstyle/RESULTS.md`): collapsed
  Button = **44× wall-clock** (8.80ms→0.20ms / 200 mounts × 5 runs),
  `mountChild` 9→1, `styler.resolve` 22→0, `runtime.tpl` 0→1. GRADUATE.
- `audit-call-sites.ts`: **95.3%** of real-app rocketstyle call sites are
  statically resolvable (every dimension prop a string literal / bare
  boolean attr).
- `collapsed-Button.ts`: a hand-written reference of exactly what the
  compiler should emit (`_tpl('<button class="…">', …)` → `NativeItem`),
  with an explicit "what's bypassed and might break" list — the bail
  catalogue below is derived from it.

The win is the only lever that turns "co-leader with Solid/Vue" (measured,
PR #647) into "uniquely fastest" on the synthetic bench, because no other
framework has a multi-dimensional theme system to compile away.

---

## Decision 1 — Light + dark: **dual-emit** (not single-emit)

**Decision.** Emit BOTH the light-resolved and dark-resolved class strings
plus a one-line runtime selector that reads the live mode accessor
(`useMode()` — already exposed by PyreonUI as a signal). The static CSS
rule set for both modes is injected once, deduped by the existing
`@pyreon/styler` FNV-1a hash (Phase 3's `_injectStaticRules`).

**Why.** Whole-theme / mode swaps are a first-class Pyreon feature
(CLAUDE.md: theme swaps "propagate … without remounting the VNode").
Single-emit bakes whichever mode resolved at build time and **silently
freezes dark mode on every collapsed Button** — a correctness regression
strictly worse than the perf win it buys. Dual-emit's marginal cost is 2
class strings + one `() => mode() === 'dark' ? D : L` thunk, the cheapest
reactive shape that exists; it is noise against a 44× collapse.

**Rejected.** Single-emit (correctness regression). Per-mode separate
templates (doubles the hoisted-template count for zero benefit over
swapping a class string on the one cloned node).

**Bail.** If the resolved chain reads any signal *other than* mode (a
custom reactive dimension), the call site is not collapsible — see
Decision 3. Dual-emit only ever varies on `mode`.

**Reversibility.** Dual-emit is a superset. A future project proven
mode-static can narrow to single-emit safely; the reverse (single→dual
after shipping) would be a silent breaking change. Pick the superset now.

---

## Decision 2 — Pre-built `@pyreon/ui-components` consumers: **sidecar manifest** (not runtime introspection)

**Decision.** Each rocketstyle-based published package emits, at **its
own** build time, a `rocketstyle-manifest.json`: `{ componentName →
{ dimensionComboKey → { lightClass, darkClass, staticRules } } }`,
cache-keyed by the same FNV-1a hash styler already uses. The
consumer-side compiler pass reads the manifest as pure data and **bails
on any component / dimension-combo absent from it** (graceful
degradation to the runtime path — never wrong, just not collapsed).

**Why.** Runtime introspection (instantiate the component inside the
compiler to read its resolved classes) requires a DOM + styler runtime
*inside the compiler*, re-executes user `.theme()`/`.attrs()` callbacks
with possibly-different module state, and couples `@pyreon/compiler`
(layer 3, standalone) to the full UI runtime — a dependency-order
violation and a fragility magnet. A sidecar is a versioned, inert data
artifact: deterministic, diffable, and cache-coherent with styler.

**Rejected.** Runtime introspection (fragility + layer violation).
"Just re-run the chain from `lib/`" (closures over module state make
this non-deterministic — the exact bug class #4's descriptor-copy sweep
just closed in the prop pipeline).

**Vertical-slice consequence.** The first slice **deliberately excludes**
this case: it targets only call sites whose rocketstyle definition lives
in the *app's own `src/`* (no manifest needed — the compiler has the
source). Cross-package manifest consumption is **Phase 5**, started only
after the slice proves byte-for-byte parity on the local-definition case.

---

## Decision 3 — Collapsibility: **bail-on-callback heuristic** (not `__rs_collapsible` opt-in brand), with an explicit opt-OUT

**Decision.** Default to the E2-validated static heuristic: collapse a
call site **iff** every dimension prop is a string literal or bare
boolean attr **AND** the resolved theme/dimension chain reads no signal
beyond `mode` **AND** there is no `{...spread}` on the element **AND** no
dimension-affecting callback closes over a non-static value. Anything
uncertain → do not collapse. Provide a per-call-site / config opt-**out**
(`data-no-collapse`, or a `collapse.exclude` glob) for escape, **not** an
opt-in.

**Why.** An opt-in brand makes the fast path the exception: every
rocketstyle author (including all 67 `@pyreon/ui-components`) must
remember the brand, and a forgotten brand fails *silently slow* — looks
correct, just never accelerates, invisible in review and tests. The
heuristic makes the fast path the default and is conservative by
construction: a false negative is correct-but-slow (acceptable); a false
positive is wrong output (unacceptable) — so every uncertain signal
suppresses collapse. This mirrors the proven `_wrapSpread` /
`no-heavy-import-only-in-handler` "single uncertain reference suppresses"
shape already in the codebase.

**Bail catalogue** (from `collapsed-Button.ts:"what's bypassed"`):
1. Any dimension prop is a signal / conditional / non-literal expression.
2. `{...spread}` anywhere on the element (matches `audit-call-sites.ts`'s
   `jsx-spread` reason).
3. A `.theme(t => …)` / `.attrs(p => …)` callback that reads a signal or
   closes over a non-module-static value.
4. A custom reactive dimension (signal-driven dimension other than mode).
5. *(Resolved by Phase 3, not a bail)* pseudo-state CSS (hover/focus/
   disabled) — E2's collapsed shape only worked because a prior runtime
   mount populated the sheet; `_injectStaticRules` removes that
   dependency so collapsed sites are self-sufficient.

**Rejected.** Opt-in brand (silent-slow drift, the worst failure mode).
Whole-program "collapse everything" (false positives on the 4.7%).

**Reversibility.** An opt-in `__rs_collapsible` brand can later be ADDED
as a force-collapse override for a heuristic false-negative *without*
removing the heuristic — additive, non-breaking. The reverse is not.

---

## Decision 4 — Emission: **hoisted per-template `_$tpl_N` factory** (not inline `cloneNode`)

**Decision.** Emit a module-scope `const _$tpl_N = _tpl('<button
class="…">', bind)`; the call site becomes `_$tpl_N()`. The static-rule
injection is a one-time module-eval side effect keyed by FNV-1a.

**Why.** This is the existing compiler convention (CLAUDE.md: static JSX
hoisted as `const _$h0 = …`; `_tpl()` is the cloneNode fast path; E2's
`makeCollapsedButton` is exactly this shape — returns a `NativeItem` from
`_tpl(...)`). A hoisted factory: (a) dedupes the template node + rule
injection across all N mounts of that site (N Buttons clone ONE node —
the fast path E2 measured at 44×); (b) keeps rule injection out of the
per-mount path; (c) is already understood by `internElementBundle`, the
runtime, and the bundle-budget gate. Inline `cloneNode` re-emits the
template string per call site (bundle bloat) and re-runs injection per
mount (defeats the win).

**Rejected.** Inline `cloneNode` (bytes + per-mount cost).

---

## Vertical slice — the smallest end-to-end proof

**Target shape (only this):** `<Button state="<lit>" size="<lit>">…static
text…</Button>` where `Button` is a rocketstyle component defined in the
**app's own `src/`**. One example app: `examples/ui-showcase` (already
the rocketstyle real-app regression gate; E2 used its Button).

**In-slice phases** (from §P0's 6-phase scope, restricted to the shape):
1. Config + detector (`pyreon.config.ts` `collapse: true` flag, Vite
   wiring, `IS_ROCKETSTYLE` + literal-prop detector, **app-local
   definitions only**, full bail catalogue from Decision 3).
2. Build-time resolution (run the dimension/theme chain in the compiler;
   reuse styler FNV-1a for class identity; **dual** light+dark per
   Decision 1).
3. Emission (hoisted `_$tpl_N` per Decision 4 + `_injectStaticRules`,
   deduped).
4. Parity + acceptance (below).

**Explicitly deferred OUT of the slice:** cross-package
`@pyreon/ui-components` consumers (Decision 2 → Phase 5); reactive /
spread / callback-closure call sites (Decision 3 → never collapse);
custom non-mode reactive dimensions (bail). Phases 5 (examples/opt-in
docs) + 6 (soak/ship) of §P0 run only after the slice's acceptance is
green.

**Slice acceptance** (open-work §P0 criteria, scoped to the one Button
shape):
- Collapsed site passes `runtime.tpl >= 1` and `runtime.mountChild == 1`
  (E2's measured signature).
- Build-time-resolved class string == runtime-resolved byte-for-byte
  (parity test, both modes).
- `bun run --filter=examples/ui-showcase build && preview` produces the
  same DOM with the flag on and off.
- A ui-showcase mount journey shows **≥30% wall-clock** improvement
  (`perf:record`).
- All existing tests pass with `collapse: true` (regression-free),
  including the ui-showcase e2e regression gate.

**Kill criterion (slice-level).** If byte-for-byte parity for this single
Button shape is not achievable within Phase 2's 1-week budget, **stop and
postmortem**. The cross-package case (Decision 2) is strictly harder; it
is not worth starting if the local-definition case can't reach parity.

**Why a slice, not the full 6-phase up front.** A Phase-1-only landing
(detector + flag, no emission) would itself be the typed-but-unimplemented
anti-pattern the `audit-types` gate exists to catch. The slice is the
smallest increment that is *fundamentally complete* end-to-end (detect →
resolve → emit → parity-proven) while honestly bounding scope.

---

## What this spike is NOT

Not runtime code. Not a perf claim. Not approval to start a 4-6 week
build — it is the decision artifact that *gates* that build. The
benchmark positioning in `CLAUDE.md` stays exactly as PR #647 measured it
(co-leader with Solid/Vue; "uniquely fastest" remains unearned until this
ships and a ui-showcase real-app number is recorded).
