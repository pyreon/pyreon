# Kanban (audit example)

**Status: walls-finder, not a working app.** This example was built as the
second user-shape audit (T4.2 from the open-work plan, following hn-clone
as T4.1) to surface framework gaps in a Trello/Notion/Linear-shaped UX —
specifically cross-column drag-and-drop and per-row state-tree mutations.

See [`WALLS.md`](./WALLS.md) for the 6 walls surfaced (W18-W23). The
highest-severity finding is **W23** — a reactivity bug where child effects
inside a `<For>`-mounted component lose all signal subscriptions after the
For's source signal fires.

[`W23-repro.md`](./W23-repro.md) has a minimal repro outline.

## What works

- Initial render — 4 default cards across 3 default columns.
- Cross-tab persistence via `@pyreon/storage` (`localStorage`).
- URL-synced search input via `@pyreon/url-state` (URL updates correctly).
- Add column (writes to `board.columns`, persists across reload).
- Single add OR single delete on a fresh page load.

## What doesn't work (yet)

- Multiple sequential state-tree mutations (W23). After the first
  add-card OR delete-card, the For's effect inside each `BoardColumn`
  loses its subscription. Subsequent writes still update the store +
  localStorage, but the DOM stops reconciling.
- Search filter (W23) — input is wired to the URL but card filtering is
  disabled pending the W23 fix.
- Cross-column DND (not yet verified end-to-end; was scheduled after the
  W23 investigation absorbed the budget).

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
