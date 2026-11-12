---
'@pyreon/vite-plugin': patch
'@pyreon/preact-compat': patch
---

Compat mode now aliases more framework subpaths to the compat packages: `preact/compat` (to a new `@pyreon/preact-compat/compat` entry carrying the main entry plus the hooks, `memo` and `forwardRef`), `preact/compat/jsx-runtime`, `preact/compat/jsx-dev-runtime`, `@preact/signals-core`, `solid-js/web` and `solid-js/store` (to `@pyreon/solid-compat`, which already ships `render`, `Portal`, `createStore`, …), and `@vue/reactivity`, `@vue/runtime-core`, `@vue/runtime-dom`. Any other subpath of the compat framework (for example `svelte/transition` or `react-dom/server`) still resolves normally but now prints a one-time `[Pyreon]` warning instead of silently loading the real framework.
