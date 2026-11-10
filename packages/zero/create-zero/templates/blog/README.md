# {{name}}

A [Pyreon Zero](https://pyreon.dev/docs/zero) blog — markdown posts, static site generation, tags, pagination, RSS and SEO (Open Graph, Twitter cards, JSON-LD) built in. It runs on [`@pyreon/zero-content/blog`](https://pyreon.dev/docs/blog), the same module as pyreon.dev/blog.

## Getting started

```bash
bun install
bun run dev          # → http://localhost:3000
```

## What's in this project

- **`src/content/blog/`** — your posts, one markdown file each (the file name is the URL)
- **`content.config.ts`** — declares the `blog` collection (`blogCollection()`: frontmatter schema + publish dates)
- **`src/blog.ts`** — the blog: site URL, title, authors, page size (`defineBlog`)
- **`src/routes/blog/`** — four one-line routes: the index, its pages, a post, a tag page
- **`src/routes/index.tsx`** — landing page with the latest posts
- **`src/routes/about.tsx`** — about page
- **`vite.config.ts`** — the content plugin also writes the RSS feed to `/blog/rss.xml`

### Adding a post

Create `src/content/blog/hello-pyreon.md`:

```md
---
title: Hello, Pyreon
description: A short summary for the listing, the meta description and the RSS feed.
date: 2026-05-25
tags: [announcement]
# cover: /covers/hello.png   (a file in public/)
# draft: true
---

Your post, in markdown.
```

It appears in the listing, on its tag pages and in the RSS feed, and gets its own prerendered page.

### Scheduling a post

`date` is the publish date. A post dated in the future is left out of every build made before that day and appears with the first build on or after it — deploy on a schedule (a daily CI job) and posts go live on their date. Preview the future with `PYREON_CONTENT_NOW=2026-06-01 bun run build`. In `bun run dev`, drafts and scheduled posts open at their URL (marked as such) but stay out of the listings.

## Scripts

| Command | What it does |
| --- | --- |
| `bun run dev` | Dev server with HMR |
| `bun run build` | Pre-render the index, every post and tag page → static HTML |
| `bun run preview` | Serve the production build locally |
| `bun run doctor` | Audit the project (lint + types + perf budgets) |
| `bun run lint` | Run `@pyreon/lint` (Pyreon-specific rules) |

## Deploying

Static site generation produces a fully self-contained `dist/` — deploy to any static host. The project was scaffolded with a deployment adapter (see `vercel.json` / `wrangler.toml` / etc.) for one-click deploys.

## Learn more

- **Docs** — https://pyreon.dev/docs
- **Zero meta-framework** — https://pyreon.dev/docs/zero
- **SSG mode** — https://pyreon.dev/docs/ssg
- **`<Image>` + `<Head>`** — https://pyreon.dev/docs/zero#meta

Found a bug or have a question? https://github.com/pyreon/pyreon/issues
