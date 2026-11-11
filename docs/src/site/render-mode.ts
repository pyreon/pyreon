/**
 * Which pages hydrate as a whole app and which ship static HTML with islands.
 *
 * Marketing pages render inside `SiteShell`, whose `<main>` carries
 * `STATIC_MARKER`. In the browser, `entry-client.ts` reads the marker and
 * loads only `static-client.ts` (island hydration) for those pages; every
 * other page (the docs) loads the router app.
 *
 * Consequences for anyone adding to a marketing page:
 *   - Server-rendered content never runs in the browser. Anything interactive
 *     (a button with a handler, a signal that changes, a demo) must be an
 *     island: `island(() => import('./Thing'), { name, hydrate })` from
 *     `@pyreon/zero`. A handler outside an island silently does nothing.
 *   - An island that renders kit components needs the UI system's context in
 *     the browser: root it in `KitScope` (`kit/scope.tsx`); `DemoGrid` does it
 *     for product demos.
 *   - Links are plain links (a full page load between marketing pages).
 *
 * The docs app can still render a marketing page in the browser (a link from
 * the docs into `/products/form`): there the page runs as a normal component
 * tree inside the router and its islands mount themselves, so the same code
 * works in both modes.
 *
 * Zero has no per-route islands-only render mode; this file and
 * `vite-plugins/static-pages.ts` are the app-side version of one
 * (pyreon/pyreon#4371).
 */
export const STATIC_MARKER = 'data-site-static'

/**
 * A static host answers every unknown URL with `404.html`. Under `/docs/`
 * that page may be a docs route the client can still resolve (a catch-all),
 * so it gets the app; anywhere else the 404 stays static.
 */
export function isStaticSitePage(doc: Document): boolean {
  if (doc.querySelector(`[${STATIC_MARKER}]`) === null) return false
  const fallback = doc.querySelector('meta[name="pyreon-ssg-fallback"]') !== null
  return !(fallback && doc.location.pathname.startsWith('/docs/'))
}
