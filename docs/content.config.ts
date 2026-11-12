import { defineCollection, defineConfig } from '@pyreon/zero-content'
import { blogCollection } from '@pyreon/zero-content/blog'

// Minimal Standard Schema validator — requires `title` (universal docs
// convention). Pages may carry any other frontmatter without
// validation; PR 9 polish will tighten this to a stricter zod schema.
const docsSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'pyreon-docs',
    validate: (input: unknown) => {
      if (
        input &&
        typeof input === 'object' &&
        typeof (input as { title?: unknown }).title === 'string'
      ) {
        return { value: input as { title: string; description?: string } }
      }
      return {
        issues: [
          {
            message: 'docs frontmatter requires a `title` string',
            path: ['title'],
          },
        ],
      }
    },
  },
}

// Blog posts (`/blog/<slug>`): `@pyreon/zero-content/blog`'s collection —
// the post frontmatter schema, `date` as the PUBLISH date, and drafts plus
// posts dated after the build left out of that build entirely (no page, no
// bundle chunk, no index/tag/RSS/sitemap/search entry). The site is static,
// so a scheduled post goes live with the first deploy on or after its date
// (see docs/README.md).
export default defineConfig({
  collections: {
    docs: defineCollection({
      type: 'pages',
      path: 'src/content/docs',
      schema: docsSchema,
    }),
    blog: blogCollection(),
  },
})
