---
'@pyreon/server': patch
---

An island now ends when its DOM leaves the page. A client-side navigation, the router HMR swap, `<Show>`/`<For>`, a parent re-render or a Suspense swap unmounts the island: `onUnmount` runs once, effects, timers and listeners stop, a trigger that has not fired (`visible`, `idle`, `media`, `interaction`, `prefetch`) is cancelled, and a chunk still loading never mounts. The cleanup `hydrateIslands()` returns now unmounts hydrated islands too (call it when a static host replaces island DOM itself, or from `import.meta.hot.dispose`), and a second `hydrateIslands()` no longer hydrates a live island twice. Closes #4387.
