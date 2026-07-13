---
"@pyreon/cli": patch
---

Canonicalize `repository.url` to npm's `git+https://…` form across every
published package, and add a `distribution/non-canonical-repository-url`
invariant to the distribution gate (`pyreon doctor` / `check-distribution`)
so it can't regress.

This removes the `npm warn publish "repository.url" was normalized to
"git+https://github.com/pyreon/pyreon.git"` line npm printed once per
package on every release (69 lines of publish-log noise). The published
metadata is byte-identical to what npm was already auto-correcting to —
there is no runtime or API change.
