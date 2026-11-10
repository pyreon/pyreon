// Populates the content registry the blog reads (SSG render + static paths).
import "virtual:zero-content/collections"
import { defineBlog } from "@pyreon/zero-content/blog"

/**
 * The blog. Every page under src/routes/blog/ is one line that points here.
 * Set `siteUrl` to your real origin — canonical URLs, Open Graph tags and
 * JSON-LD are absolute.
 */
export const blog = defineBlog({
  siteUrl: "https://example.com",
  title: "Blog",
  description: "Recent writing, statically rendered.",
  feedPath: "/blog/rss.xml",
  authors: {
    me: { name: "Your Name", url: "https://example.com/about" },
  },
  defaultAuthor: "me",
})
