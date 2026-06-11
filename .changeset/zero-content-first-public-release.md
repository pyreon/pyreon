---
'@pyreon/zero-content': minor
---

First public release. `@pyreon/zero-content` is the content layer for markdown-driven Pyreon sites: compile-time `.md` → Pyreon JSX through a remark pipeline (Shiki dual-theme highlighting, callout/code-group containers, heading anchors), typed collections with zod schemas (`getCollection`/`getEntry` with emitted ambient types), MDX components scanned from `src/mdx/`, and the `<Example>` primitive — real `.tsx` files mounted inline with optional cross-mount signal-bridging via `share`. Tightly coupled to `@pyreon/zero` by design (the integration IS the value). Powers the production Pyreon docs site. The 20 pending feature changesets accumulated while private all ship in this first publish.
