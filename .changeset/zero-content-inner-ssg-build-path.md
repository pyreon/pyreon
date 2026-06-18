---
'@pyreon/zero-content': patch
---

Fix the search-index emission during `@pyreon/zero`'s inner SSG server build.
That inner build is also `command: 'build'`, so it slipped past the dev-mode
gate and re-emitted the index — and because it sets `build.outDir` to an
absolute path, `path.join(root, build.outDir)` concatenated it onto `root`,
writing the index to a doubled `<root>/<root>/dist/.zero-ssg-server/…` path.
The `closeBundle` hook now skips when `PYREON_ZERO_SSG_INNER_BUILD` is set (the
outer client build already owns the index) and uses `path.resolve` so an
absolute `build.outDir` can never double.
