---
'@pyreon/atlas': minor
---

Workbench UX and DX fixes from the 2026-09 audit.

- **The sidebar has a persistent filter.** The tree used to be filtered by the ⌘K dialog's query, which every exit path clears — so a 108-component tree could never stay filtered. `filter` is its own signal with its own input; the dialog keeps its transient query.
- **↑↓ browse the rows the sidebar shows** (filtered, parts under their parent, nothing inside a collapsed group) and scroll the selected row into view; the old walk over the flat catalog order selected components that were not on screen.
- **Addon panel bodies are built on demand and rebuilt per component.** Every panel's body ran at mount (a reactive-graph baseline walk among them), and a panel's results — an axe run, a Lens verdict — outlived the component they were about.
- **Parts nest under their parent in the sidebar** (`partOf`), and a long scenario list is capped at 8 with a "show all N" row.
- **A link carries the view** (`?view=docs` — a Docs page was unlinkable), a forced pseudo state, the Data panel's query state and the Roles panel's role. Brand, appearance, panel widths and open flags persist in `localStorage`; a link still wins for what it names.
- **`atlas dev` re-derives the catalog when a scanned file changes** — a component added, a prop renamed or a variant declared after boot was invisible until a restart. Debounced, serialised, and a failed rescan keeps the previous catalog and says so.
- **Measure reports real pixels** — at 200% zoom a 100×40 button reported 200 × 80.
- The a11y probe coalesces mutations into one frame and notifies only when a check changed (the hover highlight was re-running the analysis it fed).
- Chrome a11y: the view segment and addon tabs are `tablist`/`tab` with `aria-selected`; the resize handles are focusable `separator`s movable with ←/→ (⇧ for 64px); the ⌘K dialog is a `dialog` that restores focus to its opener; the profile avatar states `aria-haspopup`/`aria-expanded`.
- The usage snippet shows object/array props and has a Copy button; the search index is built once; the catalog graph's collision path is a lookup, not a scan (O(n²) on a 995-file icon package); both side panels start closed below 900px.
