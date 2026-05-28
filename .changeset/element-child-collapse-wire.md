---
'@pyreon/compiler': patch
'@pyreon/vite-plugin': patch
---

P0 element-child collapse — PR 2 (resolver wiring + emit).

Wires PR 1's recursively-static element-child detector into the collapse
pipeline so a `<Progress state="primary" size="medium"><div style="…" /></Progress>`
shape now actually collapses. **No new runtime helper** — unlike partial
(`_rsCollapseH`) and dynamic (`_rsCollapseDyn`), the resolver SSR-renders
the REAL component WITH its child subtree and bakes the full output HTML,
so the emit is the UNCHANGED `__rsCollapse(...)` and the cloned template
already contains the children.

- **Compiler** (`@pyreon/compiler`): `detectElementChildCollapsibleShape`
  (literal root props + recursively-static element children → `{ props,
  childTree, childrenKey }`); `scanCollapsibleSites` emits ONE
  `CollapsibleSite` per element-child site carrying `childTree` +
  `childrenText = serializeStaticChildren(childTree)`;
  `tryRocketstyleCollapse` falls through to `tryElementChildCollapse`
  (key match → unchanged `__rsCollapse`). `StaticChild` / `StaticChildNode`
  re-exported from the package entry for the resolver.
- **Resolver** (`@pyreon/vite-plugin`): `ResolveInput.childTree` channel +
  `buildChildVNodes(tree, h)` rebuilds the real child VNodes via `h()` so
  the SSR render bakes the full subtree HTML (byte-faithful — the tree was
  normalized with the compiler's own `cleanJsxText`). Cache key includes
  the child tree.

The element-child site expands to ONE resolution (no per-value fan-out,
unlike dynamic's two), so the census trustworthiness invariant becomes
`collapsible + 2×dynamic-addressable + 1×element-child-static-addressable
=== scanner-count`. All 1414 compiler + 207 vite-plugin tests pass.

Bisect-verified: removing the `|| tryElementChildCollapse` emit arm fails
the 2 positive emit specs; stubbing the scan element-child branch fails
the 2 site-emission scan specs; restored → all green.
