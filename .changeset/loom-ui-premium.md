---
'@pyreon/loom': patch
---

Observatory UI: instant interactions, responsive layout, and a polished static build.

- **Matrix**: renders only edge cells in a CSS grid (~1.3k nodes instead of ~23k) and drives selection through one stylesheet, so a selection change costs ~7 ms instead of a 2.5–3.9 s freeze. Sticky row/column headers, a selection crosshair, foundations-first ordering (back-edges sit above the diagonal), scroll reset on entry.
- **Graph**: built once per shown set; hover and selection no longer recreate the SVG. Selection moved by ↑/↓ or ⌘K is scrolled into view (sidebar and graph). External labels keep their scope and truncate in the middle.
- **⌘K** owns its own query — typing no longer re-filters the sidebar and graph behind the dialog — and caps rendered hits at 50. Result names are readable in dark mode; the field no longer draws a square outline over the `esc` hint.
- **Manifest** is a real table with aligned columns and a sticky header (the grid-on-a-button layout stacked every cell).
- **Theme** follows `prefers-color-scheme`, remembers the toggle, and sets the page background; light-mode contrast raised.
- **Mobile**: sidebar and detail panel become drawers, tabs scroll horizontally, the graph gets the screen.
- **Static build** (`loom build`): now ships the fonts, the page reset and the graph/matrix styles (previously only `loom dev` injected them), and carries the selection across tab navigations in the URL hash. The matrix page drops from 1.2 MB to ~330 KB.
- `loom dev` serves the UI with Pyreon's production gate folded, removing ~330 ms of dev-only instrumentation from the first mount.
- Detail panel and manifest show info-severity findings alongside errors and warnings.
