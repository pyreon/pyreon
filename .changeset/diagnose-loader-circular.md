---
'@pyreon/compiler': patch
---

Teach `pyreon doctor diagnose` / MCP `diagnose` the loader circular-reference
error, which the catalog did not cover at all.

`@pyreon/router`'s loader serializer throws `[Pyreon] Loader returned circular
reference at "…"`. It is one of the few SSR failures that surfaces as a hard 500
with a stack pointing into framework code, and the cause is almost always an ORM
instance with its back-references intact rather than anything the author wrote
deliberately — so the paste-the-error path is where it should be answered.

The diagnosis names the distinction the serializer actually draws, because that
is the part a reader gets wrong: a SHARED reference (`{ author: user,
lastEditor: user }`) is a DAG and serializes fine, so this error means the graph
genuinely closes on itself. The fix points at a plain projection and says why
that is worth doing regardless — everything a loader returns is embedded in the
HTML and shipped to every visitor, so returning a whole ORM row also ships
columns the page never renders.
