---
'@pyreon/zero-content': patch
---

`content.config.ts` now loads in dev even when Vite's SSR module graph evaluates a second copy of the `@pyreon/*` packages it imports. The config loader runs inside the same singleton-sentinel silent window `@pyreon/zero` already uses for its own `ssrLoadModule` calls. Before this, the sentinel threw `Multiple instances of @pyreon/reactivity detected`, the config failed to load, and collection type generation was skipped. This happened on every dev-server start of the repo's own docs site.
