---
'@pyreon/runtime-dom': patch
---

The devtools registry now records each component's real parent and its own element (development builds only). A component that a reactive update mounts later, such as a `<For>` row, a `<Show>` branch or a route, was registered as a root; its parent now comes from the owner chain. Every component after the first among siblings was registered with its first sibling's element, so `highlight(id)`, the element picker and the devtools inspector pointed at the wrong DOM.
