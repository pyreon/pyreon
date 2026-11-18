---
'@pyreon/vite-plugin': patch
---

In compat mode, an import of a framework's server renderer now says what to use instead. `react-dom/server` (and its `.browser`/`.node`/`.edge` builds and `react-dom/static`), `vue/server-renderer` / `@vue/server-renderer` and `svelte/server` are not provided by the compat packages and resolve to the real framework, which cannot render Pyreon components. The once-per-specifier warning told you to import the equivalent from the compat package, which has none; it now names `renderToString` (or `renderToStream`) from `@pyreon/runtime-server`, and notes that Pyreon's `renderToString` is async.
