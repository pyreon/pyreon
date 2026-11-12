import { defineConfig } from "@pyreon/zero-content"
import { blogCollection } from "@pyreon/zero-content/blog"

// One collection of markdown posts in src/content/blog. `date` is the
// publish date: a post dated after the build — or marked `draft: true` —
// is left out of that build entirely (no page, no listing, no feed entry).
export default defineConfig({
  collections: {
    blog: blogCollection(),
  },
})
