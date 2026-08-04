---
'@pyreon/atlas': patch
---

Make `atlas build` and `atlas dev` work in an INSTALLED consumer workspace.

Both were broken there, and neither the unit suite nor the in-repo e2e could see
it: a tool running from the same workspace as its target never meets the layout
an install produces. Found by packing Atlas and installing it into a separate
monorepo with the framework from npm.

- **`atlas build` could not link.** The generated entry lives in
  `node_modules/.atlas-build/`, so the bundler resolved its imports by walking up
  to the repo root — which declares none of the framework — and the build died
  with `Rolldown failed to resolve import "@pyreon/runtime-dom"`. No project
  package declares that one; Atlas does, so Atlas's own directory is now a
  resolution base.

- **`atlas dev` served a shell that could not render.** The virtual catalog
  module failed with `Failed to resolve import "@pyreon/core"`, so the page
  returned HTTP 200 and displayed an error — a dev server that looks up and is
  not.

- **An isolated install (bun, pnpm) links a dependency at a content-addressed
  store**, and that package's own dependencies sit as SIBLINGS inside the store.
  Returning the link meant transitive imports failed with `Cannot find module
  '@pyreon/reactivity' imported from …/@pyreon/core/lib/index.js`. Resolution now
  returns the real path.

- **`--port 5199` was silently ignored** — only `--port=5199` was read, while
  every other flag accepts both forms. A dropped flag is worse than a rejected
  one.

The resolver is a FALLBACK (`enforce: 'post'`), and that is the load-bearing
detail. An earlier cut ran it first, which wins even when ordinary resolution
would have succeeded and hands back a symlinked path while Vite reaches the
package's real location — two ids for one file, the framework loaded twice, and
the workbench dead with `props.model.view.set(...) is not a function`. It also
declines for project files: a component that cannot resolve an import has a real
dependency bug, and resolving it from elsewhere would hide it.
