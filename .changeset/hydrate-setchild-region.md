---
"@pyreon/runtime-dom": patch
---

Hydration adopts a compiled element whose only child is a structural value (a VNode, an array, a fragment, a component, an accessor returning one, or `a{vNode}b`) instead of re-creating the whole template: the server's nodes keep their identity. The element is claimed by identity; a `ref` or spread on that element or an ancestor sees it empty, as on a fresh render, and if it puts nodes there the value mounts fresh after them. Unmounting it detaches each node once. A bind that throws keeps the server content, including a #4385 text slot's.
