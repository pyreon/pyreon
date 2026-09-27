---
'@pyreon/atlas': patch
'@pyreon/code': patch
---

Atlas workbench preview correctness:

- Overlays a component portals to `document.body` (Modal, Dialog, Drawer) are adopted into the preview surface, which is their containing block — they render on the canvas in the kit's fonts instead of covering the whole workbench and swallowing the sidebar's clicks. The Docs block adopts them too.
- A project `wrapper` now receives the render's appearance — `mode`, `dark`, `brand` accessors (`AtlasWrapperProps`) — per render, so a provider can follow the dark workbench and each Theme Lab tile. A wrapped catalog whose wrapper never reads `brand` gets one Lab tile per mode and a note saying why, instead of identical brand cards.
- The Actions panel logs DOM interactions inside the preview (click, input, change, keydown, focus/blur) with the element they hit, so rocketstyle libraries — which declare no typed `onClick` — are no longer silent.
- Docs: the props table rows share one grid, the Copy action is a real button, a verified scenario reads as a pass, and the Source block follows re-exports to the component's own module instead of printing the package barrel.
- Props that `extend` a sibling workspace package's interface are read (Combobox had no controls); prop types resolve across the enclosing workspace when `atlas dev`/`build` is pointed at a package; an unreadable-type prop no longer gets a fabricated `''` default; structure-valued args show read-only in Controls.
- A11y: the summary counts the structural checks and axe together, labels every stat, and a violation names its target selector and markup. Why?: nodes are labelled by name or creation site, with readable chips. The Data flags strip wraps. Choosing a scenario keeps typed content the scenario does not vary.

`@pyreon/code`: the dark theme ships its own token colours — it relied on CodeMirror's light fallback highlight style, rendering keywords and strings near 2:1 against the dark background.
