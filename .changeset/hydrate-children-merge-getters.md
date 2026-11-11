---
'@pyreon/runtime-dom': patch
---

Hydration no longer freezes getter props when a component is given positional children. A component that forwards its own props with a child, `h(Inner, props, 'label')`, stayed reactive when mounted but received static values when hydrated, because `hydrateComponent` merged the children with an object spread. Mount and hydrate now build component props through one shared helper.
