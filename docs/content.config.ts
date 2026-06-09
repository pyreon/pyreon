import { defineCollection, defineConfig } from '@pyreon/zero-content'

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

export default defineConfig({
  collections: {
    docs: defineCollection({
      type: 'pages',
      path: 'src/content/docs',
      schema: docsSchema,
    }),
  },
})
