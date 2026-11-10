---
'@pyreon/compiler': patch
---

The content audit (`pyreon doctor`) recognises collections that are not a literal `defineCollection({...})`: a preset such as `blogCollection()`, a factory call, or a collection held in a variable. Each gets its literal `path` when it passes one, and `src/content/<name>` otherwise. Before, every post of a `blogCollection()` collection was reported as an orphaned markdown file.

Plain Mode (`'use plain'`) no longer wraps the tail of an `async` component after a reactive early return in `return () => { … }`. The tail of an async component contains `await`, so the wrapped output did not parse; an async body runs once, so there is no branch to keep live. Fixed in both the JS and the Rust backends.

`diagnoseError` (MCP `diagnose` / `explain_error`) explains the `orphaned-md-file` finding, including the misread of non-literal collections that older compilers reported.
