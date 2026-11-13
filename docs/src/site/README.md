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
`demos/Demo<Name>.tsx` with the real package (root it in `DemoGrid`, or
`KitScope` when the layout is not a two-column grid: an island hydrates
alone, and kit components outside that root resolve with no theme), add one
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

## Generated at build time

- `/demos/atlas/`: the Atlas workbench the Atlas product demo embeds, built
  from `examples/atlas-workshop` by `vite-plugins/atlas-demo.ts` (the real
  `atlas build`, about two seconds). Never committed.
- `/atlas/` and `/showcase/<example>/` (the full workbench and the showcase's
  live demos) are built by the Deploy Docs workflow beside the site.

## Content

One command copies every content file from the content set (the source of
truth; never hand-copy copy into a component):

```
bun scripts/sync-site-content.ts <path-to-09-site> [id ...]
```

It copies the schema (`types.ts`, `types-site.ts`), the site files (`_nav.json`,
`_products.json`, `_home.json`, `_project.json`, `_sitemap.json`,
`_channels.json`), every product file, splits the page families
(`_why.json`, `_compare.json`, `_migrate.json`, `_project.json`,
`_benchmarks.json`) into one file per page under `content/pages/`, and the
docs content (`_docs.json` into the sidebar, overview and index files,
`_docs-home.json`). Each family's copy that templates render (headings,
labels, captions) lives in a typed `template` field, never in code. JSON files
that pages read whole get a `*.check.ts` twin that `satisfies` the app's type,
so a field the schema does not know fails `bun run typecheck`.

Product files carry fields no page renders (the canvas prototype behind each
demo, reference HTML, claim sources): `vite-plugins/product-content.ts` drops
them at build, so no chunk carries them. A product hero's ember word is
`hero.emberWord` in its content file.

After a sync: `bun run typecheck`, the unit tests, a build. The content set's
own verifier (`09-site/verify/run.mjs`) checks the copy against the repo.

## Tests

- Unit (`bun run test` in `docs/`): head tags, asset helpers, the static-page
  trim, content links, every product page's content and visuals, demo roots
  (every demo's kit components sit inside `KitScope`), the build-time strip.
- Real Chromium against the production build (`e2e-configs/docs.config.ts`,
  one project per page family: site-shell, site-home, site-pages,
  site-products-a/-b, site-project, site-docs, docs) and `site-links`, which
  reads the built HTML and fails on any internal href or `#fragment` that does
  not resolve.
- `site-home.spec.ts` holds every page type to a JavaScript budget (scripts
  requested on load, no scrolling).
- Islands: `waitForNav(page)` before clicking in the shell (a static page never
  sets `data-pyreon-hydrated`); `hydrateIsland(page, selector)` to scroll one
  island awake and wait for `data-island-hydrated`; `waitForIslands(page)` for
  all of them; `trackIslandRoots` + `replacedIslandRoots` to prove an island
  adopted its server HTML (its root elements are the ones the server sent).
