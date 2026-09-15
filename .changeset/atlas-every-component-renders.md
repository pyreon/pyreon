---
'@pyreon/atlas': minor
---

Every component renders on the workbench, and the scan says so when one does not.

- **Frame width**: the fluid canvas frame spans the stage. It was an inline-flex element with no width, so the preview surface measured 80px (its own padding) on the deployed site and every block-level component — `<hr>`, `<table>`, a slider track, a tree — collapsed to zero width.
- **The canvas opens on a component's `Default` scenario, args included** — a `Tree`'s `data`, a `Combobox`'s `options`, a `Dialog`'s `open` — not on bare control defaults. Selecting a scenario applies EVERY arg, not only the ones with an editable control. A link carries only the edits.
- **`empty-render` verify finding**: a scenario that mounts cleanly but produces no DOM (no element, no text, nothing portaled) now FAILS the interaction check — "mounts, clicks and unmounts without throwing" was true of an empty container, which is how 1,090 scenarios verified while 24 components rendered nothing. A manufactured `auto-edge` scenario reports it without failing.
- **Base-aware content seeds**: a rocketstyle chain rendering through a base component (`el.config({ component: ModalBase })`) seeds `open: true` for modal-like bases (with an `open` control the overlay's `onClose` writes back) and `<option>` blocks for select-like ones; a `<select>` tag gets options instead of a string the parser drops.
- **Variant scenarios fan one axis at a time** (`Σ|axis|`) instead of crossing every axis (`Π|axis|`): four layout components sharing `indent × gap × gapY` were 150 scenarios each — 28% of a 2.5 MB catalog. `matrix: 'full'` in `atlas.config.ts` opts back into the product. The all-defaults cell is named `Default`.
- **Every component gets a `Default` scenario** unconditionally (the old rule depended on plugin order and left 95 of 108 components without one); edge cases target a CONTENT prop (`children`, `label`, …), never `src`.
- **`parts` and `browserOnly` in `atlas.config.ts`**: a declared part (`{ TabPanel: 'Tabs' }`) reports `part-of` instead of failing, and the canvas renders it inside its parent's opening scenario; a `browserOnly` component (an overlay that returns `null` on the server — a Node scan evaluates `isServer` before any DOM exists) reports `browser-only`.
- **Authored scenario args stay live**: a render-prop child or an `h()` tree written in `atlas.config.ts` reaches the canvas intact (the JSON catalog marks them), and an authored `Default` is the base every derived scenario is built on.
- **The `--check` ratchet counts a REMOVED scenario as a regression** — losing scenarios makes the counts improve, and a whole-catalog collapse (discovery returning nothing) previously exited 0.
- Number controls no longer fabricate `0`; the canvas shows a hint when a render leaves the surface empty.
