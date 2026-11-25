---
'@pyreon/compiler': patch
---

The native compiler now emits the same code as the JavaScript compiler for every file in the repository (#4851). It wrapped a `new` expression in a reactive prop (`client={new QueryClient()}` built a new client on every read), missed a component's props when its JSX sat in a callback or object literal (`return items.map((i) => <li title={p.x} />)` read `p.x` once), and added a lazy-children wrapper to templates in a fragment row under a component's sole child.
