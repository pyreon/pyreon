---
'@pyreon/runtime-dom': patch
---

feat(runtime-dom): add `_rsCollapseDynH` — runtime helper for handler-combined dynamic-collapse (closes the largest remaining real-corpus dynamic-collapse gap)

Follow-up to the 4-PR dynamic-prop partial-collapse sequence
(#765 / #766 / #767 / #771). The bail-census measurement on the real
corpus revealed the strict no-handler scope only addresses 0.2% of all
`@pyreon/ui-components` sites; the bigger 15.4% dynamic-prop bucket is
mostly **handler-combined ternaries** (`<Button state={cond ? 'a' : 'b'}
onClick={h}>` — the most common real-world shape).

PR #767's `tryDynamicCollapse` deliberately BAILED on these by design
("PR 3 scope: no-handler only"). This PR ships the runtime half of the
unlock; the compiler-emit half lands in a stacked follow-up.

## What this PR ships (runtime helper only)

`_rsCollapseDynH(html, classes, valueIndex, isDark, handlers, bind?)` —
structurally the union of:

- `_rsCollapseDyn`'s stride-2 value-major class dispatch (#765)
- `_rsCollapseH`'s handler re-attachment via the canonical
  `_bindEvent` → `applyEventProp` path (#681)

Handlers are orthogonal to both the SSR-resolved styler class AND the
value dispatcher — a `state={cond ? 'a' : 'b'} onClick={h}` site's
onClick is identical for both `state="a"` and `state="b"` resolutions
(the styler class varies, the handler does not). So the union is
behaviorally just "do both" with no new semantics. Class layout
matches `_rsCollapseDyn` (stride-2 value-major). Handler attachment
matches `_rsCollapseH` (canonical event path → delegation + batching +
name normalization).

Layer-pure: no styler / ui-core imports.

## Bisect verification

Neutralized the handler-attachment loop (`if (Object.keys(handlers).length === -1)`):

| Spec | Pre-bisect | Bisected |
|---|---|---|
| cold mount + handler invoked | PASS | **FAIL** (expected 1 to be 0) |
| value flip + handler stays attached | PASS | **FAIL** |
| mode flip + handler stays attached | PASS | **FAIL** |
| combined value+mode + 4 clicks invariant | PASS | **FAIL** (expected 4 to be 0) |
| multiple handlers all attach | PASS | **FAIL** |
| out-of-range value + handler still works | PASS | **FAIL** |
| children + class + handlers all dispose | PASS | **FAIL** |
| zero handlers (degenerate to Dyn shape) | PASS | PASS (handlers={} skips loop either way) |

7 of 8 specs fail with handler attach disabled; the 8th is the documented
degenerate "behaves identically to `_rsCollapseDyn` with no handlers"
assertion — passes either way as a structural superset proof. Restored
→ 8/8 pass.

## NOT in this PR (explicit follow-up scope)

- **Compiler emit + scan extension**: a follow-up PR will extend
  `tryDynamicCollapse` to stop bailing on handlers — instead route
  to `__rsCollapseDynH(...)` with the residual handlers object
  (mirrors the existing `tryPartialCollapse` → `__rsCollapseH` shape).
  Scan also stops skipping handler-combined dynamic sites. Plus
  verify-modes cell + bail-census update reflecting the new
  addressable surface.
- This split matches the established pattern from the 4-PR
  dynamic-prop sequence (#765 was the runtime helper, the emit
  landed separately in #767).

## Validation

- `bun run --filter='@pyreon/runtime-dom' typecheck` — clean
- `bun run --filter='@pyreon/runtime-dom' lint` — zero errors
- `bun run --filter='@pyreon/runtime-dom' test` — 681 pass + 1 skipped
- `bun run --filter='@pyreon/runtime-dom' test:browser` — 43/43 pass
  (35 pre-existing + 8 new)
- `bun run gen-docs --check` — clean
- `bun run check-doc-claims` — clean
- `bun run check-manifest-depth` — clean

## Surfaces updated

- `packages/core/runtime-dom/src/template.ts` — `_rsCollapseDynH` (new)
- `packages/core/runtime-dom/src/index.ts` — re-export
- `packages/core/runtime-dom/src/tests/rs-collapse-dyn-h.browser.test.ts`
  — 8 bisect-verified browser specs (new)
- `.changeset/runtime-dom-rs-collapse-dyn-h.md` — patch changeset

## Related

- **#765** (merged) — `_rsCollapseDyn` runtime helper
- **#766** (merged) — `detectDynamicCollapsibleShape` detector
- **#767** (open) — scan extension + `__rsCollapseDyn` emit
- **#771** (merged) — probe + verify-modes + bail-census ratchet
- **#761** (closed spike) — originally surfaced the recommendation
