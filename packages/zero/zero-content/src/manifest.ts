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
    'MDX support: JSX-in-markdown + top-of-file `import` statements hoisted to the compiled .tsx',
    'src/mdx/ convention scan — drop a PascalCase .tsx file, use the component in any .md by name (no wiring)',
    'Virtual module `virtual:zero-content/components` re-exports the scanned set + the built-ins',
    'Astro-style typed content collections via zod schema inference + emitted .pyreon/content-types.d.ts',
    'getCollection<K>(name) / getEntry<K, S>(...) / getEntries<K>(...) runtime queries with full type inference',
    'Standard Schema-compatible frontmatter validation (zod / valibot / arktype / typia all work via duck-typing)',
    'Three-tier MDX component resolution: built-ins → src/mdx/ convention scan → per-.md imports → escape-hatch defineComponents',
    'Auto-generated catch-all routes per type:"pages" collection under src/routes/_content/ (no fs-router fork)',
    'Built-in components: Callout, CodeGroup, CodeBlock, PackageBadge, Playground, Tabs',
    'Shiki syntax highlighting with shared instance + dual light/dark theme baked into one emit (no runtime cost)',
    'Custom markdown blocks: :::tip / :::warning / :::note / :::danger / :::info / :::code-group via remark-directive',
    'Build-time validation: frontmatter (zod) + component props (TS) + unknown component name (with "did you mean...?")',
    'HMR for src/mdx/ changes + content.config.ts edits — invalidates virtual modules, re-renders dependent .md pages without reload',
    'Built-in search — minisearch-backed `<Search>` component with Cmd+K + debounced query + SPA navigation + lazy index loading',
    'Built-in layout components — `<Sidebar>` with groups + active highlighting, `<Toc>` with scroll-spy via IntersectionObserver',
    'Frontmatter JSON Schema + .vscode-settings emission — autocomplete + validation in any .md file via the YAML extension',
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
    {
      name: 'Callout',
      kind: 'component',
      signature: '<Callout type="tip"|"warning"|"note"|"danger"|"info" title? children?>',
      summary:
        'Built-in callout box. Emitted automatically by the `:::tip` / `:::warning` / `:::note` / `:::danger` / `:::info` container syntax in markdown. Each type carries a default icon + title; pass `title` to override. Body content renders through the full markdown pipeline (bold, links, code, lists all work inside).',
      example: `// In markdown:
:::tip{title="Pro tip"}
Use **signals** for fine-grained reactivity. See [reactivity rules](/docs/reactivity).
:::

// In JSX (when used directly):
<Callout type="warning" title="Breaking change">…</Callout>`,
      mistakes: [
        'Forgetting the closing `:::` line — the rest of the markdown file becomes part of the callout silently.',
        'Using `:::tip` to highlight code — Shiki + dual themes already make code blocks visually distinct; callouts are for prose context (warnings, tips, side-notes).',
        'Putting a `:::code-group` inside a `:::tip` — directives don\'t nest reliably; refactor to sibling blocks.',
      ],
    },
    {
      name: 'CodeGroup',
      kind: 'component',
      signature: '<CodeGroup labels={["npm","bun","pnpm"]} initial? children>',
      summary:
        'Tabbed code blocks. Emitted by the `:::code-group` container syntax — each child code fence carries `[label]` in its meta string. The active tab is a signal; SSR ships tab 0 visible, client-side hydration enables tab switching with zero per-mount cost (tabs are CSS class swaps, not VNode reconciliation).',
      example: `// In markdown:
:::code-group
\\\`\\\`\\\`bash [npm]
npm install @pyreon/zero
\\\`\\\`\\\`
\\\`\\\`\\\`bash [bun]
bun add @pyreon/zero
\\\`\\\`\\\`
:::`,
      mistakes: [
        'Omitting the `[label]` on a code fence inside `:::code-group` — the unlabelled block is silently dropped from the group (consistent with the prototype, but easy to miss). Always label every fence.',
        'Mixing languages without labels — `:::code-group` is for the same task in different syntaxes (npm vs bun vs pnpm), not arbitrary unrelated code.',
        'Hand-writing `<CodeGroup>` JSX with mismatched labels-to-children count — write markdown instead so the codegroup plugin keeps them in sync.',
      ],
    },
    {
      name: 'CodeBlock',
      kind: 'component',
      signature: '<CodeBlock lang? filename? dangerouslySetInnerHTML={{ __html }}>',
      summary:
        'Wrapper around a Shiki-rendered code block. Emitted automatically when highlighting is enabled — Shiki produces a full `<pre><code>` with per-token coloring + dual light/dark themes baked into one `<span>` tree, and CodeBlock wraps it for filename labels + copy buttons (future) without forcing the markdown pipeline to know about them. The `dangerouslySetInnerHTML` here is safe because Shiki output is build-time HTML, not user input — round-tripping it through the JSX emitter would throw away the precomputed coloring.',
      example: `// Output from \\\`\\\`\\\`ts\\nconst x = 1\\n\\\`\\\`\\\` becomes:
<CodeBlock lang="ts" dangerouslySetInnerHTML={{ __html: "<pre class=\\"shiki\\">…</pre>" }} />

// Hand-using is rare; the pipeline emits it for you.
<CodeBlock lang="ts" filename="signal.ts" dangerouslySetInnerHTML={{ __html: shikiOutput }} />`,
      mistakes: [
        'Hand-emitting CodeBlock without Shiki-shaped HTML in `__html` — you lose dual-theme support; just write a code fence in markdown.',
        'Trying to read or mutate the rendered HTML at runtime — it\'s baked at build time. To customize coloring, swap themes via the plugin\'s `highlighter` option.',
        'Building a copy-to-clipboard button by parsing the `__html` — use the original code value before highlighting (PR 4 will expose the raw value alongside the rendered HTML).',
      ],
    },
  ],
})
