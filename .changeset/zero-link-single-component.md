---
'@pyreon/zero': patch
---

The default `<Link>` is now one component rendering its `<a>` directly, with no conditional spreads, so the anchor compiles to a string template on the server and a cloned template on the client. Same markup and behaviour; `createLink` is unchanged.
