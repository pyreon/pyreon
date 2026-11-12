---
'@pyreon/create-zero': minor
---

The `blog` template now runs on `@pyreon/zero-content/blog`, the same module as pyreon.dev/blog. Posts are markdown files in `src/content/blog/`, and the project gets a paginated index, tag pages, previous/next and related posts, reading time, scheduled posts by `date`, Open Graph / Twitter / JSON-LD tags, and an RSS feed at `/blog/rss.xml` emitted by the content plugin (it replaces the hand-written `/api/rss` route and the TSX posts).
