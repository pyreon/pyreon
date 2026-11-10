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
  // After every post: a call-to-action box, share links (X, Bluesky,
  // LinkedIn, Mastodon — plain links, no scripts) and the RSS link. Add
  // `newsletter: { action: "<your provider's form URL>" }` for a sign-up
  // form. If your posts end with their own closing, set `cta: false`.
  postEnd: {
    cta: {
      heading: "Thanks for reading",
      text: "There is more where this came from — and a feed if you want new posts as they land.",
      links: [
        { label: "All posts", href: "/blog" },
        { label: "About this blog", href: "/about" },
      ],
    },
  },
})
