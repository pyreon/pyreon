---
"@pyreon/compiler": patch
---

Make directive-island registry names unique across files

Follow-up to the within-file collision fix: `fileSlug` collapses `-`/`_`/`.` to
`_`, so two sibling dirs differing only by the separator (`foo-bar/Page` vs
`foo_bar/Page`) produced the SAME island `name` — the cross-file `duplicate-name`
collision the feature promises to prevent by construction. A stable FNV-1a hash
of the full file path is now appended to `name` (the readable slug is kept;
`varName` is untouched — it's module-scoped).
