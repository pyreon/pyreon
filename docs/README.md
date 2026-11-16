# @pyreon/docs

Pyreon's documentation site, built on top of `@pyreon/zero` +
`@pyreon/zero-content`. **Dogfoods the framework end-to-end** — the
docs site itself runs on Pyreon's signal-based reactivity, fs-router,
SSG, and content pipeline. Deployed at https://pyreon.dev.

Replaces the legacy VitePress site that previously lived here. The
cutover (delete VitePress, promote the side-by-side preview to
production) landed in the cutover PR.

## Layout

| Path                        | What it holds                                          |
| --------------------------- | ------------------------------------------------------ |
| `src/content/docs/`         | 95+ markdown pages — one per package + patterns       |
| `src/content/blog/`         | Blog posts → `/blog/<slug>`, tags at `/blog/tags/<tag>`, feed at `/blog/rss.xml` |
| `public/blog/covers/`       | Blog cover images (1600x840 PNG)                       |
| `src/mdx/`                  | Convention-scanned components (PascalCase, used inline in `.md`) |
| `src/components/`           | Docs layout pieces (header, sidebar, toc) and the pre-redesign landing |
| `src/routes/`               | fs-router pages: `_layout.tsx` (root: head defaults + `<PyreonUI>`), `docs/` (docs shell), `(site)/` (marketing shell: home, products, brand, blog, showcase, open) |
| `src/site/`                 | The redesigned marketing site: `theme.ts` (every token), `kit/` (rocketstyle components), `shell/` (nav, mega menu, mobile sheet, footer), `pages/`, `demos/` (live product demos as islands), `content/` (the content set, synced) |
| `src/styles/`               | docs.css + syntax themes                               |
| `src/examples/`             | Real `.tsx` example components mounted via `<Example>` |
| `content.config.ts`         | `defineCollection({ schema })` declarations            |
| `vite.config.ts`            | Vite + zero + zero-content + last-updated plugin wire  |
| `vite-plugins/`             | `last-updated` (per-page git mtime injection)          |

## Marketing site (`src/site/`)

Built with Pyreon's own UI system (rocketstyle on `@pyreon/elements`, styler,
unistyle, coolgrid, kinetic). The root `<PyreonUI>` runs in CSS-variables mode
(`src/site/ui-init.ts`): every `mode(light, dark)` pair is one custom
property, so prerendered HTML serves both themes and the pre-paint script in
`index.html` picks one (stored choice under `pyreon-theme`, else the OS).
The hand-written stylesheets sit in a `docs` cascade layer below the UI
system's layers (`vite-plugins/legacy-css-layer.ts`).

- **Tokens:** `src/site/theme.ts` is the only place a colour, size or easing
  lives. Kit components read it directly (`tone(m, 'text')` for mode pairs).
- **Kit gallery:** `/brand/kit` shows every component in both themes.
- **Content:** `src/site/content/` is a copy of the content set
  (`pyreon-promo/09-site`). Re-sync with
  `bun scripts/sync-site-content.ts <path-to-09-site> [id ...]`; never edit the
  copied JSON here. App-side additions live in `content/model.ts` and
  `content/extra-sections.ts`.
- **Adding a product page:** sync its `<id>.json`, write
  `src/site/demos/Demo<Name>.tsx` with the real package, add one line to
  `src/site/demos/registry.ts`. The route `/products/[id]` prerenders every
  content file present; code in it is highlighted at build time
  (`vite-plugins/product-content.ts`).
- **Tests:** `bun run test` (unit, incl. token contrast) and the real-Chromium
  shell spec `e2e/site-shell.spec.ts` (`bun run test:e2e:docs`).

## Run

```bash
# Dev (localhost)
bun run dev

# Build (writes to dist/, base path default `/`)
bun run build

# Build the site as it will look on a later date (scheduled blog posts)
PYREON_CONTENT_NOW=2026-11-16 bun run build

# Preview the build
bun run preview
```

## Authoring

- **New page**: drop a `.md` file under `src/content/docs/<slug>.md`
  with frontmatter (`title`, optional `description`, `since`, etc.).
  The catch-all route `[...slug].tsx` picks it up automatically; the
  sidebar config governs ordering + grouping.
- **Live example**: `<Example file="./examples/<topic>/<slug>" />` in
  any `.md`. The component file lives at
  `src/examples/<topic>/<slug>.tsx` and is a real default-exported
  Pyreon component. Two calls with the same `share="key"` receive the
  SAME `Signal<unknown>` — proving cross-mount reactivity.
- **Code blocks**: every fence is highlighted by Shiki at build time
  using both light + dark themes inlined as a single `<span>` tree —
  the page's `data-theme` swap flips the visible variant via CSS, zero
  JS cost.
- **Callouts**: `:::tip` / `:::warning` / `:::note` / `:::danger` /
  `:::info` container directives → `<Callout type="…">`.
- **Code groups**: `:::code-group` with each child fence carrying
  `[label]` after the language tag.
- **MDX components**: drop a PascalCase `.tsx` file under `src/mdx/`
  and use it in any `.md` by name — zero imports needed (convention
  scan).

## Blog

The blog runs on `@pyreon/zero-content/blog` (guide: `/docs/blog`):
`blogCollection()` in `content.config.ts`, `defineBlog(...)` in
`src/blog/blog.ts`, five one-line routes under `src/routes/(site)/blog/` (index,
`page/[page]`, `[slug]`, `tags/[tag]/index`, `tags/[tag]/page/[page]`).
The module decides what exists (published posts only) and writes the head
tags; `views` draws the index, tag and post pages in the site kit
(`src/blog/views/`), with every label from `_channels.json` (`blog`). Every
post ends with its own "Start building" section in the markdown; after it
come share links, a copy-link button, the subscribe band and the posts to
read next. The newsletter, once it exists, launches through `/newsletter` (below).

Posts live in `src/content/blog/<slug>.md`:

```yaml
---
title: "Post title"
description: "One or two sentences — the index card, meta description and RSS summary."
date: 2026-11-16          # PUBLISH date (UTC calendar day)
slug: post-slug           # must equal the file name
tags: [javascript, webdev]
cover: /blog/covers/post-slug.png   # 1600x840 PNG in public/blog/covers/, then run
                                    # bun scripts/blog-cover-variants.ts (WebP for the page)
# coverAlt: What the cover shows   # optional; without it the cover is decorative
# updated: 2026-11-20     # optional; last meaningful revision
# author: vit             # optional; defaults to vit (authors in src/blog/blog.ts)
# canonical: https://…    # only if first published elsewhere
# draft: true             # never published while set
---
```

**To publish on a date:** add the file with that future `date` and merge
it whenever it is ready. It is not published by the merge itself: a
production build leaves out every post that is a draft or dated after the
build — no page, no bundle chunk, no index, RSS, sitemap or search entry.
The post goes live **automatically with the first deploy on or after its
date** (`date: 2026-11-16` counts from 00:00 UTC that day). No manual step
is needed: `Deploy Docs` runs on `main` every day at 00:05 UTC, so a post
is normally live a few minutes into its UTC publish day (GitHub can delay
a scheduled run during peak load).

`Deploy Docs` deploys `main` on any of:

- the daily schedule (00:05 UTC),
- a push to `main` that touches `docs/**` or one of the framework packages
  listed in `.github/workflows/docs.yml`, or
- a manual run, to publish sooner: Actions → **Deploy Docs** → *Run
  workflow* on `main` (`gh workflow run docs.yml --ref main`).

To preview a scheduled post locally, build with
`PYREON_CONTENT_NOW=<date>` (see Run) or open `/blog/<slug>` in `bun run
dev`, where drafts and scheduled posts still render (the index lists only
published ones).

## Site pages: /open, /showcase, /discord, /newsletter

Four addresses that posts link to, so they must never move.

- **`/open`** (`src/routes/(site)/open.tsx`, `src/open/`): live project numbers. They
  are fetched once per build by `vite-plugins/open-stats.ts` (GitHub repo,
  search and release APIs; npm download ranges for `@pyreon/core`,
  `@pyreon/zero` and `@pyreon/create-zero`) and baked into the page, so the
  daily deploy is what refreshes them. Repository counts come from
  `countRepo` in the doc-claims gate, the same counters that fail CI when a
  number in the docs drifts. A source that is down, slow or rate-limited
  renders as "unavailable right now" and never fails the build. CI passes
  `GITHUB_TOKEN`; locally it works without one.
  `PYREON_OPEN_STATS_OFFLINE=1 bun run build` skips the network.
- **`/showcase`** (`src/routes/(site)/showcase.tsx`, `src/showcase/ShowcasePage.tsx`):
  the examples from the repository. The copy is `_channels.json` (`showcase`);
  the screenshots are real captures from the asset set (slot `showcase-card`,
  synced by `scripts/sync-site-assets.ts`). The deploy also builds
  `examples/collab-board` and `examples/react-compat` into `/showcase/<name>/`
  as live demos (see `.github/workflows/docs.yml`).
- **`/discord`** and **`/newsletter`**: stable links driven by
  `src/site-links.ts`, copy from `_channels.json`. They are not routes:
  `vite-plugins/channel-gate.ts` writes each as a static redirect, and only
  while its channel has an address (below).

### Switching on /discord or /newsletter

Set the target in `src/site-links.ts`, one line each, and merge:

```ts
export const SITE_LINKS = {
  discord: 'https://discord.gg/<invite>',
  newsletter: 'https://<newsletter sign-up page>',
} satisfies Record<string, string | null>
```

The next deploy writes that page as a redirect that works on a static host:
a `<meta http-equiv="refresh">`, a canonical link to the target, `noindex`
and a visible "Continue" link; redirects stay out of the sitemap. The target
must be an absolute `https://` URL (anything else fails the build), and it is
used exactly as written: a query string a visitor arrives with is not
forwarded.

While a target is `null` the channel does not exist on the site: no page
(the address is a 404), no sitemap entry, and no link to it anywhere. One
rule does this, `gateChannels` in `src/site-links.ts`, which
`vite-plugins/channel-gate.ts` applies to every content JSON file as it is
imported (the unit tests load the same plugin):

- a list item whose `href` or `route` is `/discord`, `/newsletter` or their
  `https://pyreon.dev/…` form is dropped (the nav icon, the mobile sheet, the
  footer, the blog's buttons and "Get new posts" strip, the community links,
  the home page's closing links, sitemap rows);
- copy that names the channel inside a sentence or a single slot is written
  without it, and the channel version sits beside it in `withChannel`
  (`{ "text": "…", "withChannel": { "discord": { "text": "…on Discord…" } } }`),
  merged in only while the channel is open;
- anything left that still points at a closed channel fails the build with
  the file and the field.

So the content set is written for a site without the channels, and setting
an address brings every link back with no code change. Blog posts are
published text, not content JSON: they name only channels that exist, and
`src/tests/site-links.test.ts` fails if one links a closed channel.

The site's own unit tests (`bun run test` in `docs/`) cover the stats
fetchers, including every failure path, the link config and the channel rule,
and the showcase data; `e2e/site-project.spec.ts` checks the blog and the
pages in the built site, and `e2e/site-links.spec.ts` that no built page links
a closed channel.

## Deploy

GitHub Actions workflow `.github/workflows/docs.yml` builds the site with
a root base (`vite build`, served at the apex `pyreon.dev`) and deploys
`dist/` to GitHub Pages on every push to main that touches `docs/**` or
any of the framework packages the docs build transitively depends on,
once a day at 00:05 UTC (scheduled blog posts), and on a manual
`workflow_dispatch` run on `main`. Pull requests run the build job only,
as a check; they never deploy.

## Related

- `@pyreon/zero-content` — the markdown → JSX content pipeline
- `@pyreon/zero` — the meta-framework (fs-router + SSG)
- `@pyreon/vite-plugin` — Pyreon's Vite plugin (JSX transform + HMR)
