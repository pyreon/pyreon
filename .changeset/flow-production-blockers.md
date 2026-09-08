---
'@pyreon/flow': patch
---

Production hardening from the 2026-09 deep audit.

- `addNode` refuses a duplicate id (dev-warns naming it) instead of silently
  corrupting the id map and `<For>` keying; `addEdge` dev-warns when an
  endpoint is not in the graph; `<Flow>` dev-warns once per unknown
  `nodeTypes` key instead of silently rendering the default node.
- The shared node `ResizeObserver` is disconnected when the last node leaves;
  `dispose()` releases the undo/redo snapshots; the unknown-handle warning
  cache is bounded.
- `flowStyles` and the anchoring/marker helpers are documented in the
  manifest (MCP `get_api`); the docs gain an SSR and hydration section; a
  `@pyreon/flow::core` import budget locks that a flow which never calls
  `layout()` does not pull the layout engine. Dead elkjs residue removed from
  the tests.
