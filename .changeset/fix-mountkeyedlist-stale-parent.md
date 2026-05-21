---
'@pyreon/runtime-dom': patch
---

Fix `mountKeyedList` using stale closure-captured parent — same bug
class as #776 (`mountReactive`), in the sibling reactive entry point
for inline keyed arrays. Three call sites in `mountKeyedList`'s effect
body used the closure-captured `parent`:

1. `parent.insertBefore(anchor, tailMarker)` in `mountNewEntries`
2. `mountVNode(vnode, parent, tailMarker)` immediately after
3. `keyedListReorder(..., parent, tailMarker)` → `applyKeyedMoves`
   → `moveEntryBefore` → `parent.insertBefore(node, before)`

When `mountKeyedList` was created with `parent === frag` (its accessor's
keyed-array sample reached `mountChild`'s function branch from inside
a containing `mountFor`'s DocumentFragment-then-move pattern), every
subsequent effect re-run with new entries called `insertBefore` against
the stale fragment and threw
`NotFoundError: Failed to execute 'insertBefore' on 'Node'`. The throw
landed in Pyreon's unhandled-effect-error path → console.error +
loss of newly-added children.

The bug was reachable only when a For child function returned a
function directly (`(i) => () => signal().map(...)`), so the inner
keyed array is mounted DIRECTLY into the For's fragment rather than
into an intermediate Element. Wrapping the keyed array in a `<div>`
isolates `mountKeyedList` from the frag-move (the `<div>` is the
parent in that case), which is why #776's coverage of `mountReactive`
didn't expose this path.

Fix: `mountKeyedList` now reads `tailMarker.parentNode` at each
effect run and threads the resulting `liveParent` through
`mountNewEntries` and `keyedListReorder`, falling back to the
closure-captured `parent` only when the marker is detached
(cleanup edge case). Same pattern as #776's `mountReactive` fix.

Bisect-verified against the new browser CONTRACT spec at
`packages/core/runtime-dom/src/tests/keyed-array-in-for-batched-toggle.browser.test.ts`:
reverting just the `liveParent` swap reproduces the exact
NotFoundError + 10-of-50 children (40 added entries lost across
10 rows × 4 missing inserts each). Restored → 2/2 specs pass.

Full runtime-dom suites green: 47/47 browser tests (10 → 11 files,
+2 new specs), 681/681 unit tests. Lint + typecheck clean.

Discovery + fix chain across this bug class:
- #770 leak-audit harness
- #772 leak-sweep multi-journey driver
- #774 it.fails CONTRACT lock for For-of-Show
- #776 `mountReactive` root-cause fix
- this PR — `mountKeyedList` sibling fix (audit + close-out)
