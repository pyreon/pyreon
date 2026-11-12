---
'@pyreon/zero-content': minor
---

`defineBlog({ views: { index, tag, post } })` renders a page type with the site's own component. Each view receives the computed page data as props (`BlogListView`: the page's posts, page number, page count, total, pager URLs, the most-used tags and the tag of a tag page; `BlogPostView`: the post, its body component, its headings for a table of contents, previous/next, related posts, the absolute URL and the preview status), while the blog keeps the queries, not-found handling, head tags and static paths. Without `views` the default markup is unchanged.
