---
"@pyreon/runtime-dom": patch
"@pyreon/compiler": patch
"@pyreon/core": patch
---

Fix a `<Show>` (or any component) whose children are compiled elements going stale after they are torn down and mounted again (#3955). A multi-child `<Show>` stopped updating its bindings the first time `when` re-ran truthy, and hiding then re-showing even a single child froze its content at the first value: a compiled template built once as a component child was re-inserted after its bindings had been disposed. The compiler now marks a templated child (`_tpl(html, bind, 1)`), the item rebuilds itself when mounted after a teardown, and a `<Show>` whose verdict did not change keeps its DOM (focus and typed input survive) for several children as it already did for one. Both compiler backends emit the flag and agree byte for byte.
