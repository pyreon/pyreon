# The marketing site (`docs/src/site/`)

Everything on pyreon.dev that is not the docs: the homepage, products,
story pages, benchmarks, blog, showcase, the 404. Built with Pyreon's own UI
system on Zero.

## How a marketing page runs

**Static HTML with islands.** Every page — the `(site)` shell, the docs and
the 404 — is server-rendered at build time and never hydrates as a whole. The
browser entry (`src/entry-client.ts`) loads `static-client.ts`, which hydrates
only the `<pyreon-island>` elements on the page. The docs follow the same
model: their islands are listed in `docs-ui/islands.ts` (search, the drawer,
page actions, code copy and scroll-spy, live examples, demo tabs).
`render-mode.ts` explains the contract; Zero has no per-route islands-only
mode yet (#4371), so `vite-plugins/static-pages.ts` removes the route
preloads and loader data a static page (the `data-site-static` marker that
`SiteShell` prints) does not need.

What that means when you build a page:

- **Anything with a handler or a changing signal is an island.** Declare it
  with a literal call so the islands registry finds it:
  `const Demo = island(() => import('./Demo'), { name: 'Demo', hydrate: 'visible', prefetch: 'idle' })`
  (from `@pyreon/zero`). A handler outside an island does nothing on a static
  page. Pick `hydrate` by need: `idle` for the shell, `visible` for anything
  below the fold.
- **Island props are JSON.** No children, no functions.
- **An island that renders kit components roots itself in `KitScope`**
  (`kit/scope.tsx`), which supplies the UI system's theme when the island
  hydrates alone. `DemoGrid` already does it, so a product demo rooted in
  `DemoGrid` needs nothing more. That loads the styling runtime (~25 KB gzip)
  with the island; the shell's islands avoid it by using plain markup with the
  class names in `kit/classes.ts`, styled by `kit/site-css.ts`.
- **Static content uses the kit freely** (`kit/*.tsx`, rocketstyle): it runs
  only on the server.
- **Links are plain links.** A click between marketing pages is a document load.
- **Motion is CSS.** `Reveal` is a scroll-driven animation; nothing waits for
  a script to become visible.

The JavaScript budget is a test: `e2e/site-home.spec.ts` fails when the shell's
JavaScript on a marketing page (entry, island hydration, the nav and copy
islands) passes its budget. Demo islands are outside it, but every page that
adds one should report what it costs.

## Adding a page

1. Add the route under `src/routes/(site)/` (it gets the shell from
   `(site)/_layout.tsx`).
2. Sync its content from the content set (below) and render from the JSON
   through a typed loader. Never hand-copy copy into a component.
3. Set its head with the one helper:

   ```ts
   import { usePageHead } from '../../site/head'
   usePageHead({ path: '/why/one-codebase', title: '…', description: '…' })
   ```

   `usePageHead({ path, title, description, type?, image?, canonical?, noindex?, jsonLd?, meta? })`
   writes the title, description, canonical, Open Graph and Twitter tags. The
   share image comes from the asset set for `path` (`shareImage(path)` in
   `kit/assets.ts`, falling back to `og/default.png`); pass `image` only to
   override it.
4. Sync the page's assets (below) and check the page in the build: `sitemap.xml`
   lists every prerendered page.

## Adding a product

Sync its `<id>.json` (`bun scripts/sync-site-content.ts <09-site> <id>`), write
`demos/Demo<Name>.tsx` with the real package (root it in `DemoGrid`), add one
line to its group's registry (`demos/registry.<group>.ts`), and sync its assets
(`bun scripts/sync-site-assets.ts <09-site> /products/<id>`). The route
`/products/[id]` prerenders every content file present.

## Adding a demo

A demo is a default-exported component in `demos/`, rooted in `DemoGrid`,
using the package it sells. The registry wraps it in `island(...)`; keep the
call literal. Simulations are allowed only for AI/MCP transcripts, the Migrate
diff and native output, and must say so on screen.

## Assets

`bun scripts/sync-site-assets.ts <path-to-09-site> [route ...] [--all] [--prune]`
copies the files `09-site/assets/manifest.json` lists for the app's routes (its
static routes, every product content file, the 404, plus any route or prefix
you pass: `/why/*`). Rasters ship as their AVIF/WebP width variants,
inlinable SVGs go to `src/site/media/`, everything else to `public/media/`
(served at `/media/<path>`), brand icons to `public/brand/`. It also writes
`content/_assets.json`, the records the helpers read.

The helpers (`kit/media.tsx`, `kit/assets.ts`; examples on `/brand/kit`):

| Helper | Use |
| --- | --- |
| `<Picture file alt? eager? sizes? />` | A raster: `<picture>` with AVIF/WebP `srcset`, width/height and alt from the manifest, lazy unless `eager` (the hero; adds `fetchpriority="high"`). A theme pair (`-dark`/`-light`) renders both; CSS shows one and the hidden one never loads. |
| `<Poster file />` | The dark/light posters of an animated SVG or chart. |
| `<Loop media={…} eager? />` | A silent loop from a content `media` block: posters as HTML, a small island for the video (loads near the viewport, follows theme and screen width, pauses off-screen and under reduced motion, pause button). |
| `<AnimatedSvg file markup={raw} />` | Inline an animated or theme-aware SVG: `import art from '../media/<path>.svg?raw'`. Or `src={url}` with `?url` for an `<img>` (follows only the OS scheme). |
| `shareImage(route)` | The share image record for a route (`usePageHead` uses it). |
| `asset(file)`, `pictureOf(file)`, `mediaUrl(file)` | The manifest record, picture data, served URL. |

## Content

`bun scripts/sync-site-content.ts <path-to-09-site> [id ...]` copies the
schema, `_nav.json`, `_products.json`, `_home.json`, `_project.json`,
`_sitemap.json` and the product files. For `_home.json` and `_project.json` it
also writes a `*.check.ts` twin that `satisfies` the app's type, so a field the
schema does not know fails `bun run typecheck`.

## Tests

`bun run test` (unit: head tags, asset helpers, the static-page trim, the
islands stylesheet, content links), then the real-Chromium specs against the
production build: `bun run test:e2e:docs` (`e2e/site-shell.spec.ts`,
`e2e/site-home.spec.ts`). Wait for `waitForNav(page)` (`e2e/site-islands.ts`)
before clicking in the shell: a static page never sets `data-pyreon-hydrated`.
