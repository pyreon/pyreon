---
'@pyreon/compiler': patch
---

`pyreon doctor diagnose` (and the MCP `diagnose` tool) now teach the mock-vnode audit's residual footgun.

The test-environment audit matches on **shape**: a `{ type, props, children }` literal in a test file reads as a hand-rolled mock VNode, which is the real anti-pattern — PR #197's silent metadata drop stayed invisible for a package's whole lifetime because no test used the real `h()` form.

That shape is not exclusive to Pyreon. A package with its own tree format carries it while its tests call the real constructors, and the audit cannot tell the two apart from the literal alone. The entry says so, and names the reflex the exemption invites: when your own package has such a tree, the fix is an explicit ratchet entry, **not** a widened heuristic. A general rule for "this literal is not a VNode" hides the findings the audit exists to surface.
