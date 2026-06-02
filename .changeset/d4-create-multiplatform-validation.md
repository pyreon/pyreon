---
'@pyreon/create-multiplatform': patch
---

Add `name` + target-directory validation to the scaffold CLI (D4 partial).

`createMultiplatformProject({ name, target })` now validates that `name`
is a non-empty, npm-compliant string (lowercase, hyphens allowed, no
spaces / colons / scoped-package shorthand) and that `target` is a path
that either doesn't exist OR is an empty directory. Throws a labeled
`ValidationError` with actionable guidance instead of silently
overwriting existing files. Closes the "scaffold clobbers existing
projects" footgun from the 2026-06 native readiness audit.
