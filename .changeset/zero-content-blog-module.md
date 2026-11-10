---
'@pyreon/zero-content': minor
---

New `@pyreon/zero-content/blog`: a production blog on a content collection, in four one-line route files.

- `blogCollection()` — a `pages` collection with a dependency-free frontmatter schema (`title`, `description`, `date`, `updated?`, `slug?`, `tags?`, `cover?`, `coverAlt?`, `author?`, `canonical?`, `draft?`; unknown fields fail the build), `date` as the publish date, and `unpublished: 'omit'` by default.
- `defineBlog({ siteUrl, title, description, … })` — `getPosts()` (published, newest first), `getPost`, `getTags` (with counts), the route components `IndexPage` (`/blog` and `/blog/page/[page]`), `PostPage` and `TagPage` (`/blog/tags/[tag]` and `/blog/tags/[tag]/page/[page]`, paginated like the index), and their `getStaticPaths` (`pagePaths`, `postPaths`, `tagPaths`, `tagPagePaths`). Drafts and future-dated posts reach no listing, tag page, tag count, page count, previous/next, related list or JSON-LD; a production build never renders an unpublished post, even under `unpublished: 'runtime'`. In development they open at their URL with a Draft/Scheduled notice.
- SEO on every page: title, description, canonical, Open Graph with `article:*`, Twitter card, and JSON-LD `BlogPosting` (post), `Blog` (index) or `CollectionPage` (tag). The builders are exported (`blogPostHead`, `blogListHead`, `blogPostingJsonLd`).
- Pure queries (`paginate`, `postsWithTag`, `countTags`, `adjacentPosts`, `relatedPosts`, `readingMinutes`, `slugifyTag`) and components (`PostList`, `PostCard`, `PostHeader`, `PostMeta`, `TagList`, `Pagination`, `PostNav`, `RelatedPosts`, `ShareLinks`, `NewsletterForm`), plus an optional stylesheet, `@pyreon/zero-content/blog.css`, with one-class specificity and `--pyreon-blog-*` colour variables.

Every compiled content module now exports `wordCount` (prose and code) and `excerpt` (the first paragraph as plain text), available on `CollectionEntry`. `isEntryPublished(collection, data)` answers the production publish question for one entry reached by slug.

`getCollection` now reads one metadata chunk per collection (`virtual:zero-content/meta/<name>`: frontmatter, slug, headings, word count and excerpt, no bodies) and loads an entry's page chunk only when `render()` is called. A listing no longer downloads every entry it lists: with 15 posts, the JS that pyreon.dev's `/blog` loads fell from 929 KB to 310 KB raw (220 KB to 95 KB gzipped), and a post page now loads only its own article.

**Breaking:** an entry's frontmatter is now the collection schema's PARSED output, not the YAML as written: defaults are applied, coercions and transforms run, and a `Date` stays a `Date` (it was serialized to an ISO string). This is what the generated `CollectionSchemas` types always promised. Code that relied on the raw shape (parsing date strings, or defaulting fields the schema already defaults) should read the schema's type instead. A schema must output plain data: strings, numbers, booleans, `null`, `Date`, arrays and plain objects.
