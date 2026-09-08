---
'@pyreon/flow': minor
---

React Flow interaction parity.

- Every edge has an invisible hit area (`edgeInteractionWidth`, default
  20px; per-edge `interactionWidth`), so hairline edges are clickable.
- Selected edges show endpoint handles; dragging one onto another handle
  reconnects that end (`reconnectable` / `edgesReconnectable` opt out).
- `connectionLineType` + a custom `<Flow connectionLine>` component with
  accessor props; the built-in line now patches in place per pointer move.
- Pan/zoom options: `panOnDrag` (boolean or button list), `panOnScroll` +
  `panOnScrollSpeed`, `zoomOnScroll`, `zoomOnPinch`, `zoomOnDoubleClick`,
  `selectionOnDrag`, `selectionMode: 'partial' | 'full'`, `preventScrolling`.
- Keys: `deleteKeys`, `multiSelectionKey`, `selectionKey`, `zoomActivationKey`.
