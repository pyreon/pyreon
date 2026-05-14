---
'@pyreon/zero': minor
---

SSG mode now does route-level code splitting by default — parity with SSR/SPA/ISR modes which already had it.

Pre-this-PR, SSG mode hardcoded `staticImports: true` in the route generator, bundling every route component into the main client chunk. Trade-off was instant post-hydration navigation, but the initial bundle grew linearly with route count — a 50-route docs site shipped all 50 route components on first paint. The pre-existing 3-tier `generateRouteEntry` already handled `lazy(() => import(...))` correctly for SSR/SPA; SSG was an outlier that opted out.

Now SSG uses the same lazy-splitting logic by default. Only the landing route + its deps load up front; other routes fetch on navigation. Crossover point is ~5-8 routes: below that, single-chunk is fine and the navigation chunk-fetch is the only cost; above that, lazy splitting shrinks the initial bundle by a meaningful amount.

New opt-out: `ssg.splitChunks: false` restores the pre-2026-Q3 single-chunk behaviour for tiny sites (2-5 pages) that prefer the bundle-everything-then-instant-nav trade.

```ts
// vite.config.ts — opt out for a 3-page marketing site
zero({
  mode: 'ssg',
  ssg: { splitChunks: false },
})
```

Verified end-to-end against all 7 SSG verify-modes cells including `cpa-pw-blog` (dynamic routes + `getStaticPaths` — the case that exercises the lazy-route + namespace-import-for-build-time-export path). ISR, SSR, SPA modes are unchanged — they already had lazy splitting.

**Migration**: zero behavior change for existing apps. To preserve the pre-this-PR behaviour, set `ssg.splitChunks: false`. The default flip is the win.
