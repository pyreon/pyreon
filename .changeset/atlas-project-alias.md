---
'@pyreon/atlas': minor
---

**Atlas honours the target project's `resolve.alias`, and one broken component no longer takes down the workbench** (#2744).

Atlas creates its Vite contexts with `configFile: false` — deliberately, since the project's config carries plugins Atlas must not double-apply (it already runs the real `@pyreon/vite-plugin`). But that also discarded `resolve.alias`, so an app whose components import through its own `~/components/…` alias failed to load every one of them.

`resolve.alias` is now extracted from the project's vite config and applied to all three Vite contexts — the dev server, the static build, and **the scan's module loader**. The scan matters as much as the workbench: without it, an aliased component is silently absent from the catalog rather than visibly broken.

Only `resolve.alias` is taken — never plugins, and deliberately not `resolve.conditions` (Atlas resolves workspace packages through the `bun` condition on purpose, and inheriting the app's would break every `@pyreon/*` import). A config that cannot be loaded warns and degrades to no aliases rather than refusing to start.

`atlas.config.ts` gains an `alias` key as the explicit escape hatch. Entries declared there win — Vite matches in order and these are placed first.

**Separately: a component that fails to load is now one broken card, not a dead workbench.** The generated catalog module used static `import * as __modN from '…'` per component; a static import cannot be caught, so a single unresolvable import failed the whole module and nothing rendered. Each component is now imported individually through a caught dynamic import, and the render path's existing error-card branch — previously unreachable for this failure — surfaces the module's own message (`Cannot find module '~/shared/tokens'`) instead of a generic "could not load".
