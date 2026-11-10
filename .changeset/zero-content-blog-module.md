---
'@pyreon/zero-content': minor
---

New `@pyreon/zero-content/blog`: a production blog on a content collection, in four one-line route files.

- `blogCollection()` — a `pages` collection with a dependency-free frontmatter schema (`title`, `description`, `date`, `updated?`, `slug?`, `tags?`, `cover?`, `coverAlt?`, `author?`, `canonical?`, `draft?`; unknown fields fail the build), `date` as the publish date, and `unpublished: 'omit'` by default.
- `defineBlog({ siteUrl, title, description, … })` — `getPosts()` (published, newest first), `getPost`, `getTags` (with counts), the route components `IndexPage` (`/blog` and `/blog/page/[page]`), `PostPage` and `TagPage` (`/blog/tags/[tag]`), and their `getStaticPaths` (`pagePaths`, `postPaths`, `tagPaths`). Drafts and future-dated posts reach no listing, tag page, tag count, page count, previous/next, related list or JSON-LD; a production build never renders an unpublished post, even under `unpublished: 'runtime'`. In development they open at their URL with a Draft/Scheduled notice.
- SEO on every page: title, description, canonical, Open Graph with `article:*`, Twitter card, and JSON-LD `BlogPosting` (post), `Blog` (index) or `CollectionPage` (tag). The builders are exported (`blogPostHead`, `blogListHead`, `blogPostingJsonLd`).
- Pure queries (`paginate`, `postsWithTag`, `countTags`, `adjacentPosts`, `relatedPosts`, `readingMinutes`, `slugifyTag`) and components (`PostList`, `PostCard`, `PostHeader`, `PostMeta`, `TagList`, `Pagination`, `PostNav`, `RelatedPosts`, `ShareLinks`, `NewsletterForm`), plus an optional stylesheet, `@pyreon/zero-content/blog.css`, with one-class specificity and `--pyreon-blog-*` colour variables.

Every compiled content module now exports `wordCount` (prose and code), available as `entry.wordCount`, so reading time needs no work in the browser. `isEntryPublished(collection, data)` answers the production publish question for one entry reached by slug.
