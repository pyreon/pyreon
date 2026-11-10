---
title: Blog
description: Add a production blog to a Zero app in a few lines — markdown posts, paginated index, tag pages, scheduled posts, RSS, Open Graph and JSON-LD.
---

`@pyreon/zero-content/blog` turns a folder of markdown files into a production blog: a paginated index, a page per post, a page per tag, reading time, previous/next and related posts, an RSS feed, and the `<head>` tags search engines and social sites read. It is the module [pyreon.dev/blog](/blog) runs on, and the `blog` template of `npm create @pyreon/zero@latest` uses it too.

<PackageBadge name="@pyreon/zero-content" href="/docs/zero-content" />

## Add a blog to a Zero app

The fastest start is a new project: `npm create @pyreon/zero@latest my-blog -- --template blog`. To add a blog to an existing Zero app, there are four steps.

**1. The content plugin.** Register it before `pyreon()` and let it write the feed:

```ts
// vite.config.ts
import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'
import content from '@pyreon/zero-content/plugin'

export default {
  plugins: [
    content({
      seo: {
        baseUrl: 'https://example.com',
        rss: { collection: 'blog', path: 'blog/rss.xml', title: 'Example blog', content: 'full' },
      },
    }),
    pyreon(),
    zero({ mode: 'ssg' }),
  ],
}
```

**2. The collection.** `blogCollection()` is a `pages` collection with the post frontmatter schema and `date` as the publish date:

```ts
// content.config.ts
import { defineConfig } from '@pyreon/zero-content'
import { blogCollection } from '@pyreon/zero-content/blog'

export default defineConfig({ collections: { blog: blogCollection() } })
```

**3. The blog.** One `defineBlog` call holds everything the pages need. The side-effect import fills the collection registry the static build reads.

```ts
// src/blog.ts
import 'virtual:zero-content/collections'
import { defineBlog } from '@pyreon/zero-content/blog'

export const blog = defineBlog({
  siteUrl: 'https://example.com',
  title: 'Example blog',
  description: 'Notes from the team.',
  feedPath: '/blog/rss.xml',
  authors: { ada: { name: 'Ada Lovelace', url: 'https://example.com/ada' } },
  defaultAuthor: 'ada',
})
```

**4. The routes.** Five one-line files, each pointing at the blog:

```tsx
// src/routes/blog/index.tsx — /blog
import { blog } from '../../blog'
export default blog.IndexPage
```

```tsx
// src/routes/blog/page/[page].tsx — /blog/page/2, /blog/page/3, …
import { blog } from '../../../blog'
export const getStaticPaths = blog.pagePaths
export default blog.IndexPage
```

```tsx
// src/routes/blog/[slug].tsx — /blog/<post>
import { blog } from '../../blog'
export const getStaticPaths = blog.postPaths
export default blog.PostPage
```

```tsx
// src/routes/blog/tags/[tag]/index.tsx — /blog/tags/<tag>
import { blog } from '../../../../blog'
export const getStaticPaths = blog.tagPaths
export default blog.TagPage
```

```tsx
// src/routes/blog/tags/[tag]/page/[page].tsx — /blog/tags/<tag>/page/2, …
import { blog } from '../../../../../blog'
export const getStaticPaths = blog.tagPagePaths
export default blog.TagPage
```

Optionally import the default styles once, before your own stylesheet: `import '@pyreon/zero-content/blog.css'`.

## Writing a post

A post is `src/content/blog/<slug>.md`; the file name is its URL.

```md
---
title: Components run once
description: One or two sentences — the card, the meta description and the feed summary.
date: 2026-11-16
updated: 2026-11-20          # optional: last meaningful revision
tags: [javascript, compiler]
cover: /blog/covers/components-run-once.png
coverAlt: The compiled output of a counter component
author: ada                  # an `authors` key, a plain name, or a list
# slug: components-run-once  # optional; must equal the file name
# canonical: https://…       # only for a post first published elsewhere
# draft: true                # never published while set
---

The post, in markdown — callouts, code groups and MDX components all work.
```

`title`, `description` and `date` are required. Unknown fields fail the build, so a typo such as `tag:` cannot silently drop the tags. The schema's output is what ships: `entry.data` is a `BlogPostData` with dates as `Date`, `tags` and `author` as lists and `draft` as a boolean, and the blog turns it into a `BlogPost` (tags with slugs and URLs, author keys resolved).

Reading time and the excerpt (the first paragraph, as plain text) are recorded when the content plugin compiles the file (`entry.wordCount`, `entry.excerpt`), so nothing walks the page in the browser. The default speed is 230 words per minute (`wordsPerMinute`).

## What a listing loads

The index, its pages, tag pages, tag counts, previous/next and related posts all read one small **metadata chunk** per collection: each post's frontmatter, slug, headings, word count and excerpt, and no bodies. A post's body is a separate chunk that only its own page loads. With the 15 posts of pyreon.dev, `/blog` went from loading every post (all 15 article chunks) to loading the metadata chunk alone.

## Scheduling posts by date

`date` is the publish date. A post dated after the build — like a post with `draft: true` — is **left out of that build entirely**: no page, no bundle chunk, and no entry in the index, a tag page, a tag count, the page count, previous/next, related posts, JSON-LD, the RSS feed, the sitemap or the search index. A date-only value counts from 00:00 UTC that day.

On a static site the build decides, so a scheduled post goes live with the **first build on or after its date**. Deploy on a schedule — a daily CI job — and posts publish themselves:

```yaml
# .github/workflows/deploy.yml
on:
  push: { branches: [main] }
  schedule: [{ cron: '5 0 * * *' }]   # 00:05 UTC every day
```

To see the site as it will look on a later date, build with `PYREON_CONTENT_NOW=2026-12-01 bun run build`.

While developing, drafts and scheduled posts open at their own URL with a notice saying they are not published, and stay out of every listing. A production build never renders one, even with `blogCollection({ unpublished: 'runtime' })` — the SSR mode that bundles unpublished posts so preview mode can reach them.

## RSS

The feed is written by the content plugin's `seo.rss` option (step 1): published posts only, newest first, with full HTML bodies (`content: 'full'`) and absolute URLs, which is what feed readers and importers such as dev.to's "Publishing from RSS" expect. `feedPath` in `defineBlog` adds a "Subscribe via RSS" link to the index; add `<link rel="alternate" type="application/rss+xml">` in your layout for feed autodiscovery.

## Tags

Every tag gets a page at `/blog/tags/<tag>`, paginated like the index (same `pageSize`, same pager, `/blog/tags/<tag>/page/2`…), and the index lists the most-used tags with their post counts (`indexTags`, 10 by default). Tag URLs are slugs — `Web Dev` becomes `web-dev`, and `C++` and `C#` stay distinct from `C`. Tags that differ only in spelling (`Web Dev`, `web-dev`) are one tag; the newest post's spelling is shown. Related posts are the posts sharing the most tags with the current one, newest first on a tie; a post that shares no tag is never "related".

## SEO

Every page sets its `<head>` through `@pyreon/head`:

| Page | Tags |
| --- | --- |
| Post | title, description, canonical (`canonical` frontmatter or the post URL), `og:*` incl. image and size, `article:published_time` / `modified_time` / `author` / `tag`, Twitter card, JSON-LD `BlogPosting` |
| Index and its pages | title, description, canonical, `og:*`, JSON-LD `Blog` listing the posts on the page |
| Tag page | title, description, canonical, `og:*`, JSON-LD `CollectionPage` that is part of the `Blog` |

Set `coverSize` to the intrinsic size of your covers: it becomes `og:image:width`/`height` and the `width`/`height` of every cover `<img>`, which prevents layout shift. `publisher` adds a JSON-LD `Organization`, and `language` sets `inLanguage`. The builders are exported (`blogPostHead`, `blogListHead`, `blogPostingJsonLd`) for pages you write yourself.

## Styling and replacing parts

The components render plain HTML with `pyreon-blog-*` classes. The optional stylesheet gives every rule the specificity of one class, so a site's element resets do not break the layout and any later class rule of the site wins. Colours follow the surrounding text unless you set the variables:

```css
.pyreon-blog,
.pyreon-blog-post {
  --pyreon-blog-width: 760px;
  --pyreon-blog-muted: var(--text-muted);
  --pyreon-blog-border: var(--hairline);
  --pyreon-blog-surface: var(--bg-elevated);
  --pyreon-blog-accent: var(--brand);
  --pyreon-blog-radius: 8px;
  --pyreon-blog-meta-font: var(--font-mono);
}
```

Point `bodyClass` at your prose styles, and use `postFooter` to add anything after each post — this site adds a call to action, share links and a newsletter form there. To change a page more deeply, write the route yourself from the queries and components:

| Export | Use |
| --- | --- |
| `blog.getPosts()`, `getPost(slug)`, `getTags()` | published posts, newest first; tags with counts (read from the metadata chunk) |
| `paginate`, `postsWithTag`, `countTags`, `adjacentPosts`, `relatedPosts` | pure queries over a post list |
| `PostList`, `PostCard`, `PostHeader`, `PostMeta`, `TagList`, `Pagination`, `PostNav`, `RelatedPosts` | the pieces the routes are made of |
| `ShareLinks` | X, Bluesky, LinkedIn and Mastodon share links as plain intent URLs — no script, no tracking |
| `NewsletterForm` | a plain form that posts to `action`; renders nothing while `action` is empty |

## Configuration

| Option | Default | |
| --- | --- | --- |
| `siteUrl` | — | absolute origin; canonical, OG and JSON-LD URLs are built from it |
| `title`, `description` | — | blog name and summary |
| `collection` | `'blog'` | the content collection |
| `basePath` | `'/blog'` | URL prefix of the routes |
| `heading` | `title` | the index `<h1>` |
| `pageSize` | `10` | posts per index page |
| `relatedCount` | `3` | related posts per post (`0` turns them off) |
| `indexTags` | `10` | most-used tags listed on the index (`0` hides the list) |
| `locale` | `'en-US'` | locale of displayed dates (always rendered in UTC) |
| `language` | — | JSON-LD `inLanguage` |
| `wordsPerMinute` | `230` | reading speed |
| `authors`, `defaultAuthor` | — | author lookup and the author of posts that name none |
| `coverSize` | — | intrinsic cover size |
| `publisher` | — | JSON-LD `Organization` |
| `titleTemplate` | `'%s \| <title>'` | page title of posts and listings |
| `feedPath` | — | RSS link on the index |
| `bodyClass` | `'pyreon-blog-post__body'` | class of the post body wrapper |
| `postFooter` | — | component rendered after each post |
| `notFound` | built-in | component for an unknown post, tag or page |
