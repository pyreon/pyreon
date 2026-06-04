import { defineManifest } from '@pyreon/manifest'

/**
 * @pyreon/zero-content manifest — feeds llms.txt / llms-full.txt / MCP
 * api-reference.ts via `bun run gen-docs`.
 *
 * Scope: the markdown→Pyreon compile pipeline, content collections
 * (Astro-style typed queries), MDX-style component embedding via the
 * `src/mdx/` convention, and zod-driven frontmatter validation.
 *
 * v0 surface — expanded per-PR as collections (PR 4), search (PR 5),
 * sidebar config (PR 6), and MCP integration (PR 9) land.
 */
export default defineManifest({
  name: '@pyreon/zero-content',
  title: 'Zero Content — markdown-driven Pyreon sites',
  tagline:
    'Compile-time .md/.mdx → Pyreon JSX, typed content collections, convention-scanned MDX components',
  description:
    "Pyreon Zero's content layer. Tight coupling to zero (no standalone use) — that integration is the value: per-route LCP optimization inherits from zero's image/font/script-defer/resource-hint stack, markdown pages route through zero's fs-router via auto-generated catch-all routes, view transitions enabled by default, theme + dark mode flow through zero's theme system. Markdown is parsed via the unified+remark ecosystem (battle-tested by Astro/Next/Nuxt) and walked into Pyreon JSX (not `dangerouslySetInnerHTML` — full reactivity + tree-shaking preserved). Content collections give Astro-style typed queries via zod schema inference: `getCollection('docs')` returns fully-typed entries. MDX components resolve via three tiers: built-ins (`<Callout>`, `<CodeGroup>`, `<PackageBadge>`, `<Playground>`) → convention-scanned `src/mdx/**/*.tsx` (PascalCase exports, drop a file and use it) → per-`.md` `import` statements (one-offs) → escape-hatch `defineComponents` wrappers for per-collection overrides.",
  category: 'server',
  features: [
    'Compile-time .md/.mdx → Pyreon JSX (no dangerouslySetInnerHTML — full reactivity + tree-shaking preserved)',
    'Astro-style typed content collections via zod schema inference + emitted .pyreon/content-types.d.ts',
    'Three-tier MDX component resolution: built-ins → src/mdx/ convention scan → per-.md imports → escape-hatch defineComponents',
    'Auto-generated catch-all routes per type:"pages" collection under src/routes/_content/ (no fs-router fork)',
    'Built-in components: Callout, CodeGroup, PackageBadge, Playground, Tabs',
    'Build-time validation: frontmatter (zod) + component props (TS) + unknown component name (with "did you mean...?")',
    'Inherits zero\'s perf stack — image/font auto-wire, script defer default, resource hints, view transitions',
  ],
  longExample: `// vite.config.ts
import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero'
import content from '@pyreon/zero-content/plugin'

export default { plugins: [pyreon(), zero(), content()] }

// content.config.ts
import { defineConfig, defineCollection, z } from '@pyreon/zero-content'

export default defineConfig({
  collections: {
    docs: defineCollection({
      type: 'pages',
      path: 'src/content/docs',
      schema: z.object({
        title: z.string(),
        description: z.string(),
        sidebar: z.object({ order: z.number(), group: z.string() }).optional(),
      }),
    }),
  },
})

// User code anywhere — typed via zod inference
import { getCollection } from '@pyreon/zero-content'

const docs = await getCollection('docs')
//    ^? Array<{ slug: string; data: { title: string; description: string; ... }; render: () => Promise<ComponentFn> }>
`,
  api: [
    {
      name: 'defineConfig',
      kind: 'function',
      signature: 'defineConfig(config: ContentConfig): ContentConfig',
      summary:
        "Top-level configuration helper. Pass-through factory that preserves the literal type of `collections` so downstream type inference works. Lives in `content.config.ts` at the project root; the plugin auto-discovers it.",
      example: `import { defineConfig, defineCollection, z } from '@pyreon/zero-content'

export default defineConfig({
  collections: {
    docs: defineCollection({
      type: 'pages',
      schema: z.object({ title: z.string() }),
    }),
  },
})`,
      mistakes: [
        'Adding components in `vite.config.ts` instead of `content.config.ts`. The vite config is build orchestration; content components live in user space.',
        'Forgetting the `default export`. The plugin reads `content.config.ts` via dynamic import and reads the default export.',
        'Putting collections under a path that doesn\'t exist. Default `path` is `src/content/<collection-name>`; either create that directory or override with `path:`.',
      ],
    },
    {
      name: 'defineCollection',
      kind: 'function',
      signature: 'defineCollection<TSchema>({ type, path?, schema, components?, searchable? }): CollectionDefinition<TSchema>',
      summary:
        "Per-collection definition. `type: 'pages'` triggers route generation under `src/routes/_content/<name>/[...slug].tsx` (auto-gitignored); `type: 'data'` is queryable via `getCollection`/`getEntry` but not routed. Schema is a zod schema — frontmatter is validated against it at build with file:line errors on mismatch.",
      example: `defineCollection({
  type: 'pages',
  path: 'src/content/docs',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    sidebar: z.object({ order: z.number(), group: z.string() }).optional(),
  }),
})`,
      mistakes: [
        'Returning raw `z.object(...)` schemas without wrapping in `defineCollection`. The plugin needs the wrapper to know the collection name + type.',
        'Setting `type: "pages"` for a collection that should not be routed (e.g. blog posts queried via `getCollection` for an index page). Use `type: "data"`.',
        'Schema mismatches that surface only at build time. Use `pyreon doctor --check-content` (PR 9) at edit time, or watch the dev server output during `bun run dev`.',
      ],
    },
    {
      name: 'defineComponents',
      kind: 'function',
      signature: 'defineComponents<T extends Record<string, ComponentFn>>(components: T): T & ComponentsRegistry',
      summary:
        "Wrap a map of MDX components. The brand symbol distinguishes user bundles from accidentally raw objects (which fail the build). Dev-mode validates each value is a function — catches `{ Playground: undefined }` typos. Compose with `mergeComponents`.",
      example: `import { defineComponents } from '@pyreon/zero-content'
import { Playground, APIReference } from './components'

export default defineComponents({ Playground, APIReference })`,
      mistakes: [
        'Passing a raw `{...}` object to a `components:` field. The plugin refuses raw objects with a build error pointing at the call site.',
        'Mixing component imports inside `vite.config.ts`. Imports live in user-space files (content.config.ts or _-prefixed files under src/mdx/), never in build orchestration.',
      ],
    },
    {
      name: 'getCollection',
      kind: 'function',
      signature: 'getCollection<K extends keyof CollectionSchemas>(name: K): Promise<CollectionEntry<CollectionSchemas[K]>[]>',
      summary:
        "Runtime query — returns every entry in a collection. Data shape inferred from the collection's zod schema via the generated `.pyreon/content-types.d.ts`. Each entry exposes a `render()` lazy loader to get the page component.",
      example: `import { getCollection } from '@pyreon/zero-content'

const posts = await getCollection('blog')
//    ^? Array<{ slug: string; data: { title: string; author: string; date: Date; ... }; render(); headings }>

for (const post of posts) {
  console.log(post.data.title, post.slug)
}`,
      mistakes: [
        'Calling `getCollection` in a component body without `await`. It returns a Promise. Wrap in an async setup function, use a loader, or await it during SSG render.',
        "Passing a string that isn't a defined collection. TypeScript catches this once `.pyreon/content-types.d.ts` is generated; without it, you'd get a runtime error.",
      ],
    },
  ],
})
