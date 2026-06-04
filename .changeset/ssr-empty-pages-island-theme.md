---
"@pyreon/server": patch
---

fix(server): runtime SSR/ISR rendered empty pages + islands lost theme context across hydration (0.30.0 regressions)

Two HIGH-severity 0.30.0 regressions, both fixed in `@pyreon/server`:

- **Runtime SSR/ISR shipped empty pages.** `mode: 'ssr'` / `'isr'` server-rendered the layout but a BLANK page (status 200, the template shell) — no `<title>`, no route content. Cause: the SSR handler ran loaders only (`prefetchLoaderData`) and never resolved the matched route's lazy COMPONENTS into the cache before the synchronous `renderToString`. zero's fs-router emits every route as `lazy(() => import(...))`, so the depth-1 `<RouterView>` hit its empty lazy fallback and rendered nothing inside the layout. `mode: 'ssg'` was unaffected because it already resolved components via `router.preload`. Fix: the handler now calls `router.preload(path, req)` (resolves lazy components AND runs loaders + forwards the request + propagates loader-thrown redirects). `prefetchLoaderData` stays loaders-only — it's also the RouterLink-prefetch path, which should warm loader data on hover without eagerly downloading every route's component chunk.

- **Islands lost PyreonUI/theme context across the hydration boundary.** A `rocketstyle` component inside an `island()` crashed on hydration (`Cannot read properties of undefined (reading 'base')`) because the deferred island mount (idle/visible/interaction) created a hydration root with no link to the ancestor PyreonUI provider. #1338's owner-based context removed the global stack a late mount previously relied on to find ancestor providers. Fix: `island()` captures the context owner at the marker's render (while its owner chain is active) and re-establishes it (`runWithContextOwner`) around the island's `hydrateRoot`, so the hydrated component's `useContext()` walks up to the real provider. Static-islands apps (`hydrateIslands`, no owner) keep their prior detached-root behavior.

Both bisect-verified with regression tests at the unit (`server.test.ts` lazy-route handler render, `island-client.test.tsx` themed island), router-contract (`loader.test.ts` `router.preload` resolves components), and e2e layers — the `ssr-node` e2e specs were strengthened to assert each route's OWN page content (not just the layout nav, which rendered even when the page was blank).
