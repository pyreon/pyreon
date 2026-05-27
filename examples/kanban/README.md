# Kanban (audit example)

A working kanban board built from scratch as the second user-shape audit
(T4.2 from the open-work plan, following hn-clone as T4.1).

The audit surfaced **6 walls** (W18-W23); the highest-severity finding was
**W23** — a real reactivity bug in `runUntracked` where child effects of
`<For>`-mounted components silently lost their signal subscriptions after
the For's source signal first re-fired. **W23 is fixed in this PR**
(`packages/core/reactivity/src/tracking.ts`). See
[`WALLS.md`](./WALLS.md) for the full catalog.

## What works

- Initial render — 4 default cards across 3 columns.
- Add / delete / move cards (reactively reflected in DOM).
- Multi-mutation sequences (the W23 bug shape) — verified by e2e: add 3 +
  delete 3 + filter + reload all green.
- URL-synced + debounced search filter — every column filters its own
  state-tree-sourced card list.
- Cross-tab persistence via `@pyreon/storage` (`localStorage`).
- Add / reorder columns. Toast notifications on column add.

## What's incomplete

- Cross-column DND (`@pyreon/dnd` is wired with `useDraggable` + `useDroppable`
  — see W18 for why not `useSortable` — but the e2e cross-column drag spec
  hasn't been written yet).

## Packages exercised

- `@pyreon/state-tree` (schema mode with `zodSchema()`)
- `@pyreon/validation` (`zodSchema`)
- `@pyreon/dnd` (`useDraggable` + `useDroppable` — NOT `useSortable`, see W18)
- `@pyreon/storage` (cross-tab synced persistence)
- `@pyreon/url-state` (URL-synced search term)
- `@pyreon/hooks` (`useDebouncedValue`)
- `@pyreon/toast` (column add notifications)
- `@pyreon/zero` (SPA mode with `nodeAdapter()`)
- `@pyreon/reactivity`, `@pyreon/core`, `@pyreon/router`, `@pyreon/runtime-dom`

## Run

```bash
cd examples/kanban
bun run dev
# open http://localhost:3001
```
