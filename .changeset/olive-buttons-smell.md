---
'@pyreon/storybook': patch
---

Extract the preset's `preview` path resolution into an internal `previewPathFor(url)` helper.

`previewAnnotations` was computed at module scope from `import.meta.url`, so the
`file:` vs `http:` decision was a top-level expression no test could reach either
arm of — it ran once at import, whichever way the loader happened to resolve.
The helper makes both arms testable without changing what the preset emits:
`previewAnnotations` is byte-identical, and `previewPathFor` is marked
`@internal` rather than added to the public surface.
