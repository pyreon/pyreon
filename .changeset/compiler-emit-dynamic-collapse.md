---
'@pyreon/compiler': patch
---

feat(compiler): emit `__rsCollapseDyn` for ternary-of-two-literals sites — PR 3 of the dynamic-prop partial-collapse build

Wires the dynamic-prop fallthrough into the compiler's collapse pipeline:

1. **`scanCollapsibleSites` extension** — when the full detector
   (`detectCollapsibleShape`) bails, fall through to
   `detectDynamicCollapsibleShape` (PR 2). For a hit with no `on*`
   handlers, expand into TWO `CollapsibleSite` entries (one per
   literal value) so the resolver pre-renders both via the existing
   SSR pipeline.

2. **`tryDynamicCollapse` emit** — third fallthrough in
   `tryRocketstyleCollapse` (after full → on*-handler-partial). Looks
   up both expanded keys; if both resolved AND structural template
   parity holds across values, emits:

   ```js
   __rsCollapseDyn(
     "<button>Save</button>",
     ["pri_light", "pri_dark", "sec_light", "sec_dark"],
     () => (cond) ? 0 : 1,
     () => __pyrMode() === "dark"
   )
   ```

   Plus the standard idempotent `__rsSheet.injectRules(...)` for BOTH
   value's rule bundles (de-duped by `ruleKey` so dynamic sites sharing
   a value pay one injection).

3. **Conditional helper imports** — the import preamble pulls only
   the helpers actually emitted into this module. Dynamic-only
   modules import `_rsCollapseDyn` only; full-collapse-only modules
   import `_rsCollapse` only (preserves existing behavior); partial
   modules import both `_rsCollapse` + `_rsCollapseH` (unchanged).

## Conservative bail discipline

- Either expanded site missing from sites map ⇒ bail (intermittent
  resolver failure on one value mustn't half-collapse)
- Divergent template HTML across values ⇒ bail (the dispatcher
  shares ONE `_tpl` across values; divergent markup would silently
  pick the truthy variant's HTML for falsy too)
- Handlers present ⇒ bail (PR 3 scope is no-handler dynamic-collapse;
  a combined `_rsCollapseDynH` helper + emit is a future PR's scope)
- Multi-axis (2+ ternaries) ⇒ bail (detector enforces; separable
  scope)

## Bisect verification

Reverted the fallthrough chain (`return tryPartialCollapse(...) ||
tryDynamicCollapse(...)` → `return tryPartialCollapse(...)`):
- 4 POSITIVE emit specs fail with `expected '<source>' to contain
  '__rsCollapseDyn('` / `'__pyrMode() === "dark"'` / etc.
- 5 specs pass either way (FULL + on*-partial regression specs;
  the three conservative-bail specs which always assert absence)
- Restored → 9/9 emit + 6/6 scan + 13/13 detector = 28/28 dynamic-
  collapse pass; 1285/1285 full compiler suite pass

The asymmetry confirms the POSITIVE assertions are load-bearing on
the dynamic fallthrough — they don't pass for the wrong reason.

## NOT in this PR

- **PR 4**: bail-census update (assert dynamic-prop addressable count
  flips `collapsible` in the existing census; coverage moves 73.2% →
  ~88%), `verify-modes ui-showcase × spa` probe route (build-artifact
  gate), real-Chromium e2e gate (parity vs the 5-layer mount across
  both ternary branches).
- **Future**: handler-combined dynamic emit (the dynamic detector
  already accepts handlers; the emit + a new `_rsCollapseDynH`
  runtime helper would close that residual).

## Surfaces updated

- `packages/core/compiler/src/jsx.ts` — `scanCollapsibleSites` dynamic
  fallthrough (expands one ternary into two static sites);
  `tryDynamicCollapse` emit fn; `needsCollapseDyn` flag; conditional
  helper imports (`_rsCollapseDyn` pulled only when emitted)
- `packages/core/compiler/src/tests/dynamic-collapse-scan.test.ts` —
  6 scan specs (key parity, multi-site, multi-ternary skip, handler
  skip)
- `packages/core/compiler/src/tests/dynamic-collapse-emit.test.ts` —
  9 emit specs (POSITIVE + conservative bails + FULL/PARTIAL
  regression)
- `.changeset/compiler-emit-dynamic-collapse.md` — this file

## Related

- **#765** (merged) — PR 1: `_rsCollapseDyn` runtime helper
- **#766** (open) — PR 2: `detectDynamicCollapsibleShape` detector
- **#761** (closed spike) — surfaced the recommendation
