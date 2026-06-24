---
"@pyreon/flow": minor
---

feat(flow): theme-aware default colors + fix off-screen initial fitView

Two issues made `@pyreon/flow` graphs unreadable on a dark page (e.g. the docs
flow example — nodes invisible, no visible edges):

1. **Default colors were light-mode hardcoded** — nodes were `background: white`
   with NO explicit text color (so on a dark page the label inherited the light
   page text → light-on-white → invisible); edges/labels/minimap/controls were
   likewise fixed light colors. The node/edge/panel colors now read from
   `--pyreon-flow-*` CSS custom properties with the original values as fallbacks,
   so existing (light) consumers are unchanged and a dark app/theme can restyle
   the graph by setting those vars. New vars: `--pyreon-flow-node-bg` /
   `-node-color` / `-node-border` / `-node-selected` / `-accent` / `-edge` /
   `-edge-label` / `-panel-bg` / `-panel-border` / `-panel-shadow` /
   `-control-color` / `-control-muted` / `-minimap-node` / `-minimap-mask`.

   NOTE the edge `stroke` is applied via the path's `style` (CSS), not the
   `stroke` presentation attribute: `var()` is invalid in an SVG presentation
   attribute (`stroke="var(...)"` → value dropped → `stroke:none` → invisible
   line), but resolves in `style`.

2. **`fitView: true` positioned nodes off-screen** in small/short containers.
   The initial fit ran at `createFlow` time against the 800×600 default
   container size (the ResizeObserver hadn't measured the real element yet), so
   in e.g. a 260px-tall container the nodes landed outside the viewport. The
   `<Flow>` component now re-runs `fitView()` once on the first REAL container
   measurement (gated on a new internal `_fitViewConfigured` flag, so a flow the
   consumer didn't ask to auto-fit is never re-fitted).

Verified in real Chromium (docs flow example, both themes): node bg/text themed
(dark `rgb(17,17,24)` bg + cream text; light white + near-black), edge line
visible (dark `rgb(138,134,150)`), and all 3 nodes in-view after the re-fit
(was 0/3). 367 flow tests pass.
