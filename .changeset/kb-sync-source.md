---
'@pyreon/router': patch
'@pyreon/mcp': patch
---

docs: reconcile manifest doc-metadata with source

`useTransition()` / `useMiddlewareData()` manifest entries documented the
wrong shape (`{ isTransitioning }` / `<T>(): T`); source returns reactive
accessors (`() => boolean`, `() => Record<string, unknown>`). The mcp
`get_pattern` summary said "Eight foundational patterns" — actually 16.
Manifest-only / regenerated-api-reference; no runtime behavior change.
