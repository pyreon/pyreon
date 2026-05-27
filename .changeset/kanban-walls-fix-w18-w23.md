---
'@pyreon/reactivity': patch
'@pyreon/dnd': patch
'@pyreon/zero': patch
'@pyreon/core': patch
---

Kanban audit (T4.2) — close all 6 walls (W18-W23).

**W23 — P0 reactivity bug fix** (`@pyreon/reactivity`). `runUntracked`
now suspends `_innerEffectCollector` in lock-step with `activeEffect`.
Child component effects created inside `mountFor`'s `runUntracked` wrap
(PR #490) were auto-registered as inner effects of the For's outer
effect, then silently disposed on the For's next re-run — breaking
every effect-derived subscription in the child subtree on the first
source-signal mutation. Was a SHOWSTOPPER for any Trello/Notion/Linear/
spreadsheet-shaped app. Bisect-verified.

**W21 — incidentally fixed by W23 patch.** For-with-computed-indirection
shapes (nested inside outer For-with-mutating-source) now propagate
correctly.

**W22 — documented** (`@pyreon/core`). `For` JSDoc + `ForProps.children`
JSDoc now carry the canonical fix pattern (pass ID, child reads its own
data from store).

**W18 — cross-list groupId** (`@pyreon/dnd`). `useSortable` accepts an
optional `groupId` — two instances with the same `groupId` share a drop
universe via `onCrossListDrop(item)` (source removes) +
`onCrossListReceive(item, index)` (destination inserts). No `groupId`
keeps per-instance isolation (backward compat).

**W19 — auto-inject entry-client** (`@pyreon/zero`). `transformIndexHtml`
hook injects `<script type="module" src="${entryClient}">` before
`<!--pyreon-scripts-->` automatically. Configurable via
`zero({ entryClient: '/src/main.ts' })` or `entryClient: false` to opt
out. Default `/src/entry-client.ts`.

**W20 — already covered** by existing `pyreon/no-map-in-jsx` rule —
test extended for the reactive-accessor shape `{() => items().map(...)}`.

Closes the kanban example end-to-end. Full add → delete → filter →
multi-mutation → reload sequence is green in real-Chromium e2e.
