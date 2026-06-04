import { defineCollection, defineConfig } from '@pyreon/zero-content'

// Permissive schema: title is required; description optional. The
// migration spike doesn't run zod's `.parse()` on the docs (the
// markdown body is the primary content here), so we keep the schema
// lean and let the build-time validator surface missing titles.
const docsSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'docs-pyreon',
    validate: (input: unknown) => {
      if (
        input &&
        typeof input === 'object' &&
        typeof (input as { title?: unknown }).title === 'string'
      ) {
        return { value: input as { title: string; description?: string } }
      }
      return {
        issues: [{ message: 'docs frontmatter requires a `title` string', path: ['title'] }],
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
