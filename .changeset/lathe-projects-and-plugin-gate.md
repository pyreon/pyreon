---
'@pyreon/lathe': minor
'@pyreon/config': patch
---

Add multi-project generation, and make the native layout follow the plugin
selection.

`lathe.projects: [{ name, input, output }]` runs several specs in one pass, each
to its own output path — typically another package in the workspace, which is
the intended use. `target` and `plugins` are written once at the top level and
overridable per project. `lathe check` covers every project and fails if any is
stale. A CLI `--out` or spec path alongside `projects` is REFUSED rather than
applied to all of them: one path cannot address one project among many, and
writing every client into a single directory is never what was meant.

**Bug fix:** the native modules were emitted whenever `target` was
`multiplatform`, ignoring `plugins` entirely — so `--plugins schemas` still
produced a client and a data component. They are the `client`/`queries`
emitters' native LAYOUT, not a separate output, and now follow the same
selection.
