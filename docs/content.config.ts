import { defineCollection, defineConfig } from '@pyreon/zero-content'
import { z } from 'zod'

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

// Blog posts (`/blog/<slug>`). `date` is the PUBLISH date: a post dated
// after the build is left out of that build entirely (`unpublished:
// 'omit'`) — no page, no bundle chunk, no index/RSS/sitemap/search entry —
// and so is `draft: true`. The site is static, so a scheduled post goes live
// with the first deploy on or after its date (see docs/README.md).
export const blogSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1),
    // YAML reads an unquoted `2026-11-16` as a Date; accept a quoted
    // string too. Either way it must be a real calendar date.
    date: z.union([z.date(), z.string().regex(/^\d{4}-\d{2}-\d{2}/)]),
    // Must equal the file name (checked in the blog route's static paths):
    // the URL comes from the file, the frontmatter states it explicitly so
    // social links written ahead of time cannot drift from it.
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    tags: z.array(z.string()).default([]),
    // Site-root path of a 1600x840 image under `docs/public/`.
    cover: z.string().startsWith('/'),
    // Only for a post first published elsewhere; defaults to its own URL.
    canonical: z.string().url().optional(),
    draft: z.boolean().optional(),
  })
  .strict()

export default defineConfig({
  collections: {
    docs: defineCollection({
      type: 'pages',
      path: 'src/content/docs',
      schema: docsSchema,
    }),
    blog: defineCollection({
      type: 'pages',
      path: 'src/content/blog',
      schema: blogSchema,
      publishDate: 'date',
      unpublished: 'omit',
    }),
  },
})
