---
'@pyreon/form': patch
'@pyreon/dnd': patch
---

perf(form,dnd): batch() 6 multi-signal write sites surfaced by `pyreon/no-unbatched-updates`

Lint follow-up to PR #1110 (fundamentals R2/R3/R4 batch audit) — six sites in `use-form.ts` + `use-sortable.ts` were missed by the manual audit but caught by the `pyreon/no-unbatched-updates` lint rule.

Each `batch()` wrap collapses N notify cycles to 1 per event:

- **`@pyreon/form` `use-form.ts`** (4 sites):
  - `field.reset()` — 4 signal writes per call (value / error / touched / dirty).
  - `validate()` clear-all-errors loop — N writes per validate.
  - `validate()` schema-error apply loop — N writes per validate.
  - `setInitialValues()` per-field loop — 4×N writes per call (typical use is async-prefill landing post-mount).
- **`@pyreon/dnd` `use-sortable.ts`** (3 sites):
  - Container `onDrop` reset (activeId/overId/overEdge) — 3 writes per drop.
  - Per-item `onDrop` reset in `queueMicrotask` — 3 writes per drop.
  - `onCleanup` final reset — 3 writes per sortable dispose.

Bisect-proven via a real `@pyreon/reactivity` synthetic harness: 4 un-batched signal writes fire 4 effect re-runs; 4 batched writes fire 1. The optimization is observable subscriber-side; consumers reading 2+ form fields together (typical for validation hints) see one re-render per `field.reset()` instead of four.

Also documents one lint false positive (`runValidation` — 3 `errorSig.set()` calls in 3 mutually exclusive branches) with an inline `pyreon-lint-disable-next-line` + rationale comment. The lint rule counts function-scope total writes, not per-branch fan-out.

Lint count: `@pyreon/form` 4→0 (+1 documented exemption), `@pyreon/dnd` 3→0.
