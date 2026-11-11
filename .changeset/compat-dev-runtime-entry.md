---
'@pyreon/react-compat': patch
'@pyreon/preact-compat': patch
'@pyreon/vue-compat': patch
'@pyreon/solid-compat': patch
'@pyreon/svelte-compat': patch
'@pyreon/runtime-dom': patch
---

Fix `vite` dev on the published compat packages: each `<pkg>/jsx-dev-runtime` now ships as its own `lib/jsx-dev-runtime.js` that exports `jsxDEV`, instead of sharing `lib/jsx-runtime.js` with the production runtime. In 0.53.0 the dev entry overwrote that file, so it had no `jsxDEV` and `vite` dev failed with "does not provide an export named 'jsxDEV'". `@pyreon/runtime-dom/transition` now exports `TransitionGroup`, as documented; the published subpath only had `Transition`.
