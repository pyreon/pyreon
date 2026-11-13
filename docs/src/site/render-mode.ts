/**
 * Every page on the site ships static HTML with islands.
 *
 * Pages render inside `SiteShell`, whose `<main>` carries `STATIC_MARKER`.
 * In the browser, `entry-client.ts` loads only `static-client.ts`, which
 * hydrates the `<pyreon-island>` elements; the page around them never runs.
 * `vite-plugins/static-pages.ts` reads the marker to trim what a hydrating
 * app would need from the page head.
 *
 * Consequences for anyone adding to a page (marketing or docs):
 *   - Server-rendered content never runs in the browser. Anything interactive
 *     (a button with a handler, a signal that changes, a demo) must be an
 *     island: `island(() => import('./Thing'), { name, hydrate })` from
 *     `@pyreon/zero`. A handler outside an island silently does nothing.
 *   - An island that renders kit components needs the UI system's context in
 *     the browser: root it in `KitScope` (`kit/scope.tsx`); `DemoGrid` does it
 *     for product demos.
 *   - Links are plain links (a full page load between pages; the docs
 *     prefetch the next docs page with Speculation Rules).
 *
 * Zero has no per-route islands-only render mode; this file and
 * `vite-plugins/static-pages.ts` are the app-side version of one
 * (pyreon/pyreon#4371).
 */
export const STATIC_MARKER = 'data-site-static'
