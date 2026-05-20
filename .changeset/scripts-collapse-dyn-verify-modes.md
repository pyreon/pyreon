---
'@pyreon/compiler': patch
---

feat(scripts, compiler): build-artifact gate + bail-census ratchet for dynamic-prop collapse — PR 4 of the dynamic-prop partial-collapse build

Closes the 4-PR sequence shipping `_rsCollapseDyn` end-to-end through
the plugin → resolver → compiler → bundle pipeline. PR 4 ships the
gates that prove the fully-assembled production artifact is correct:

## 1. Probe route (`examples/ui-showcase`)

New `routes/rs-collapse-dyn-probe.tsx` — canonical dynamic-collapsible
shape: `<Button state={isPrimary() ? 'primary' : 'secondary'} size="medium">Dyn</Button>`
plus a toggle button to flip the signal. Mirrors the existing static
`rs-collapse-probe.tsx` exactly — same "dedicated route so the rest of
ui-showcase's Buttons can keep carrying `onClick` and correctly bail"
pattern.

## 2. Verify-modes cell + assertion helper

`scripts/verify-modes.ts` gets a new `assertDynProbeCollapsed(distDir)`
helper that checks the `rs-collapse-dyn-probe-*.js` route chunk for THREE
minification-stable, dynamic-emit-EXCLUSIVE fingerprints:

- **(A) Baked template** — `Dyn</span></button>` (the static children
  baked into the template literal; a non-collapsed Button never
  serializes children to a literal)
- **(B) Stride-2 value-major class array** — 4 backtick-quoted strings
  each containing `pyr-` (the styler's class namespace). The regular
  `_rsCollapse` emit takes only TWO class args; a 4-element class array
  is unique to `_rsCollapseDyn`.
- **(C) Value dispatcher** — `()=>+!cond` (the minifier's canonical
  transform of `() => (cond) ? 0 : 1`; both produce 0 for truthy, 1 for
  falsy via `+!true=0, +!false=1`). The regular `_rsCollapse` emit has
  no `+!` pattern — that fingerprint is exclusive to `_rsCollapseDyn`.

The existing `ui-showcase × spa` cell now runs BOTH `assertProbeCollapsed`
AND `assertDynProbeCollapsed`, amortizing the build cost over both gates.

**Why these fingerprints (not the pre-minification `__rsCollapseDyn(`
identifier)**: Vite renames imports in prod (`__rsCollapseDyn` → `t`
or similar). Asserting the literal identifier would never match a real
build. The fingerprints chosen are minification-stable (string/template-
literal contents) AND collapse-emit-EXCLUSIVE (don't appear in non-
collapsed code). Matches the precedent established by PR 1 of the
static collapse's `assertProbeCollapsed`.

**Bisect verified at the build-artifact layer**: reverted the
`tryDynamicCollapse` fallthrough in `tryRocketstyleCollapse` (`return
tryPartialCollapse(...) || tryDynamicCollapse(...)` → `return
tryPartialCollapse(...)`), rebuilt compiler lib, re-ran verify-modes:
- ALL THREE fingerprints become false; the probe falls back to a
  normal `h(Button, props)` mount (visible in the chunk:
  `r(a,{state:i(()=>o()?\`primary\`:\`secondary\`)...})`)
- Restored → 2/2 cells green

The `assertProbeCollapsed` (static collapse) cell still passes during
the bisect — proves the dynamic assertion is independent of the static
one and the dynamic fallthrough is the only delta.

## 3. Bail-census ratchet

`collapse-bail-census.test.ts` extended with a new
`dynamicTernaryAddressable` counter — sites that match the strict PR 3
no-handler ternary-of-two-literals shape.

**Honest finding from the real-corpus measurement**: of 564
`@pyreon/ui-components` call sites across the corpus, **1 site (0.2%)
matches the strict no-handler scope**. The bigger 15.4% dynamic-prop
bucket is mostly HANDLER-COMBINED ternaries (e.g.
`<Button state={cond ? 'primary' : 'secondary'} onClick={handle}>`)
— which PR 3 BAILS by design (handler-combined dynamic-collapse is a
future PR's scope via a combined `_rsCollapseDynH` helper).

This is the actually-measured reality vs the "lift 73.2% → ~88%"
projection from the earlier plan: the structural foundation is now
shipped (helper + detector + emit + gate), but the immediate coverage
win is small. The architectural value is the FOUNDATION for the
handler-combined follow-up which would close most of the remaining
dynamic-prop bucket.

The trustworthiness gate (`myCollapsible === scannerCollapsible`) was
updated to `myCollapsible + 2 * dynamicTernaryAddressable ===
scannerCollapsible` because the scanner now emits 2 entries per
dynamic site (one per literal value for the resolver). Same load-bearing
"census agrees with scanner truth-set" invariant, just accounting for
the new expansion.

## Surfaces updated

- `examples/ui-showcase/src/routes/rs-collapse-dyn-probe.tsx` —
  canonical dynamic-collapsible probe route (new)
- `scripts/verify-modes.ts` — `assertDynProbeCollapsed` helper +
  extended `ui-showcase × spa` cell (build-artifact gate)
- `packages/core/compiler/src/tests/collapse-bail-census.test.ts` —
  `dynamicTernaryAddressable` counter, updated trustworthiness gate,
  honest ratchet asserts
- `.changeset/scripts-collapse-dyn-verify-modes.md` — patch changeset

## Validation

- `bun run --filter='@pyreon/compiler' typecheck` — clean
- `bun run --filter='@pyreon/compiler' lint` — zero errors
- `bun run --filter='@pyreon/compiler' test` — 1285/1285 pass (1270
  pre-PR + 9 emit + 6 scan + 0 net delta on census which already counted)
- `bun run verify-modes ui-showcase` — 2/2 cells pass (static
  `assertProbeCollapsed` + new dynamic `assertDynProbeCollapsed`)
- `bun run gen-docs --check` — clean
- `bun run check-doc-claims` — clean
- `bun run check-manifest-depth` — clean

## NOT in this PR (deliberate, scoped)

- **Real-Chromium e2e gate**: SKIPPED for symmetry with the established
  static-collapse pattern (which also has no e2e — runtime locked by
  PR 1's 7 `_rsCollapse` browser specs). PR 1's 7 `_rsCollapseDyn`
  real-Chromium specs (#765) lock the runtime contract identically;
  the verify-modes gate locks the emit content; PR 1's bisect-verified
  specs lock the dispatch. The chain is complete without adding a
  third layer.
- **Handler-combined dynamic emit**: the 15.4% dynamic-prop bucket
  is mostly handler-combined ternaries (`state={cond ? ...} onClick={h}`).
  PR 3's emit deliberately bails on these; a future PR could ship a
  combined `_rsCollapseDynH` runtime helper + emit to close that
  residual. Would lift the addressable count from 0.2% of corpus to
  closer to the full 15.4% bucket.

## Related

- **#765** (merged) — PR 1: `_rsCollapseDyn` runtime helper
- **#766** (open) — PR 2: `detectDynamicCollapsibleShape` detector
- **#767** (open) — PR 3: scan extension + emit `__rsCollapseDyn`
- **#761** (closed spike) — surfaced the recommendation
