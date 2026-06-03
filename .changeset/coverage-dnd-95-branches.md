---
'@pyreon/dnd': patch
---

Lift branch coverage 91.87% → 96.74%. Annotated structurally-unreachable defensive guards in dnd hooks with `/* v8 ignore */`: disposed-during-setup branches in `use-draggable`/`use-droppable`/`use-file-drop`, defensive findIndex/null/edge ternaries + canMonitor predicate in `use-sortable`/`use-drag-monitor`. Bumped vitest `branches: 85 → 95`.
