---
title: Welcome to your new Pyreon blog
description: A quick tour of how this blog is wired together — markdown posts, static pages, tags, RSS and SEO out of the box.
date: 2026-04-28
tags: [pyreon, intro]
---

This blog is prerendered at build time. Every post is a markdown file in `src/content/blog/`, and every page under `/blog` comes from `@pyreon/zero-content/blog` — the same module that runs [pyreon.dev/blog](https://pyreon.dev/blog).

## Adding a post

Create `src/content/blog/my-new-post.md`. The file name is the URL (`/blog/my-new-post`):

```md
---
title: My new post
description: One sentence for the listing, the meta description and the feed.
date: 2026-05-01
tags: [notes]
# cover: /covers/my-new-post.png   # optional, a file in public/
# coverAlt: What the cover shows
# author: me                        # a key of `authors` in src/blog.ts
# draft: true                       # never published while set
---

The body of the post, in markdown.
```

It appears in the listing, on its tag pages and in `/blog/rss.xml`.

## Scheduling a post

`date` is the publish date. A post dated in the future is left out of every build made before that day — no page, no listing, no feed entry — and appears with the first build on or after it. To see the site as it will look on a later date, build with `PYREON_CONTENT_NOW=2026-06-01 bun run build`.

## What's next?

- Set `siteUrl`, `title` and your author in `src/blog.ts`.
- Set the same origin in `vite.config.ts` (feed + sitemap).
- Restyle the blog in `src/global.css`.
- Replace this post with your own.
