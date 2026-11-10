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
| `src/components/`           | Layout shells used by `[...slug].tsx`                  |
| `src/routes/`               | fs-router pages — index + catch-all `[...slug].tsx`    |
| `src/styles/`               | docs.css + syntax themes                               |
| `src/examples/`             | Real `.tsx` example components mounted via `<Example>` |
| `content.config.ts`         | `defineCollection({ schema })` declarations            |
| `vite.config.ts`            | Vite + zero + zero-content + last-updated plugin wire  |
| `vite-plugins/`             | `last-updated` (per-page git mtime injection)          |

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
`src/blog/blog.ts`, four one-line routes under `src/routes/blog/` (index,
`page/[page]`, `[slug]`, `tags/[tag]`), and `src/blog/PostFooter.tsx` for the
call to action, share links and newsletter form after every post. The
newsletter form renders nothing until `NEWSLETTER_ACTION` in
`src/blog/site.ts` is set to the provider's form endpoint.

Posts live in `src/content/blog/<slug>.md`:

```yaml
---
title: "Post title"
description: "One or two sentences — the index card, meta description and RSS summary."
date: 2026-11-16          # PUBLISH date (UTC calendar day)
slug: post-slug           # must equal the file name
tags: [javascript, webdev]
cover: /blog/covers/post-slug.png   # 1600x840, file in public/blog/covers/
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
