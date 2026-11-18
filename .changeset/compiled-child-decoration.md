---
'@pyreon/core': patch
'@pyreon/compiler': patch
'@pyreon/runtime-dom': patch
'@pyreon/runtime-server': patch
'@pyreon/kinetic': patch
---

Components that decorate their child element now handle compiled literal children on every side. An initially-hidden kinetic stagger item whose children are literal markup is prerendered with its hidden class and style (it rendered visible and flashed before hydration), and hydration adopts it. `<Transition>` from `@pyreon/runtime-dom` animates a literal element child (it warned "Transition child is a component" and removed the element without a leave transition). The SSR template compile keeps a keyed root element on the `h()` path, as the client compile already did, so a component sees the same child keys on the server and the client. A child's own string `style` is kept when kinetic adds its per-item style, and a numeric CSS custom property (`--i: 2`) renders without a `px` unit.
