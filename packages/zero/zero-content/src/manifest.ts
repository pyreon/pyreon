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
    "Pyreon Zero's content layer. Tight coupling to zero (no standalone use) — that integration is the value: markdown pages route through zero's fs-router, view transitions enabled by default, theme + dark mode flow through zero's theme system. Markdown is parsed via the unified+remark ecosystem (battle-tested by Astro/Next/Nuxt) and walked into Pyreon JSX (not `dangerouslySetInnerHTML` — full reactivity + tree-shaking preserved). Content collections give Astro-style typed queries via Standard Schema inference (use zod / valibot / arktype — the package itself ships no validator runtime): `getCollection('docs')` returns fully-typed entries. MDX components resolve via three tiers: built-ins (`<Callout>`, `<CodeGroup>`, `<CodeBlock>`) → convention-scanned `src/mdx/**/*.tsx` (PascalCase exports, drop a file and use it) → per-`.md` `import` statements (one-offs) → escape-hatch `defineComponents` wrappers for per-collection overrides.",
  category: 'server',
  features: [
    'Compile-time .md/.mdx → Pyreon JSX (no dangerouslySetInnerHTML — full reactivity + tree-shaking preserved)',
    'MDX support: JSX-in-markdown + top-of-file `import` statements hoisted to the compiled .tsx',
    'src/mdx/ convention scan — drop a PascalCase .tsx file, use the component in any .md by name (no wiring)',
    'Virtual module `virtual:zero-content/components` re-exports the scanned set + the built-ins',
    'Astro-style typed content collections via Standard Schema inference + emitted .pyreon/content-types.d.ts',
    'getCollection<K>(name) / getEntry<K, S>(...) / getEntries<K>(...) runtime queries with full type inference',
    'Standard Schema-compatible frontmatter validation — BYO validator (zod, valibot, arktype, typia; all work via duck-typing, no validator runtime in this package)',
    'Three-tier MDX component resolution: built-ins → src/mdx/ convention scan → per-.md imports → escape-hatch defineComponents',
    'Built-in components: Callout, CodeGroup, CodeBlock (more candidates — Playground, PackageBadge, Tabs — live in `docs/src/mdx/` and are author-side until promoted)',
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

// content.config.ts — Standard Schema-compatible validators only; the
// package itself does NOT re-export zod. Bring your own (zod / valibot /
// arktype / typia). See @pyreon/validation for the curated adapters.
import { defineConfig, defineCollection } from '@pyreon/zero-content'
import { z } from 'zod'

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

// User code anywhere — typed via Standard Schema inference
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
      example: `// content.config.ts — BYO validator (zod / valibot / arktype / typia)
import { defineConfig, defineCollection } from '@pyreon/zero-content'
import { z } from 'zod'

export default defineConfig({
  collections: {
    docs: defineCollection({
      type: 'pages',
      schema: z.object({ title: z.string() }),
    }),
  },
})`,
      mistakes: [
        'Importing `z` from `@pyreon/zero-content` — the package does NOT re-export zod. Bring your own validator (zod, valibot, arktype, typia all duck-type onto Standard Schema). See @pyreon/validation for curated adapters.',
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
    {
      name: 'Example',
      kind: 'component',
      signature: '<Example file="./path/to/example" share?="key" shareInitial?={value} title?="…" class?="…">',
      summary:
        'The Pyreon-native replacement for iframe-sandboxed `<Playground>`. Loads a real `.tsx` file inline (NOT iframe) — no escape passes, no srcdoc string-blob, no SyntaxError when a string contains a backslash. Two `<Example>` calls with the same `share` key receive the SAME signal instance via a module-level registry, so a click in one example reactively updates the rendered output of another mounted example on the same page. Build-time-resolved via `import.meta.glob` registered at startup with `registerExamples()` — no runtime overhead beyond the dynamic `import()` of the resolved chunk.',
      example: `// In markdown:
<Example file="./examples/counter" share="cnt" />
<Example file="./examples/readout" share="cnt" />

// examples/counter.tsx — a real Pyreon component file
import { signal, type Signal } from '@pyreon/reactivity'
export default function Counter(props: { shared?: Signal<number> }) {
  const count = props.shared ?? signal(0)
  return (
    <div>
      <button onClick={() => count.update(n => n + 1)}>+</button>
      <span>{count()}</span>
    </div>
  )
}

// entry-client.ts — one-time consumer-side registration
import { registerExamples } from '@pyreon/zero-content'
registerExamples(import.meta.glob('./examples/⁎⁎/⁎.tsx'))`,
      mistakes: [
        'Forgetting `registerExamples(import.meta.glob(...))` in `entry-client.ts` — the registry stays empty and every `<Example>` renders the "not found" error message. `import.meta.glob` is resolved at COMPILE TIME relative to the file it\'s called in, so the registration MUST live in the consumer\'s source tree (this package can\'t do it for you).',
        'Passing children to an example: `<Example file="./x">content</Example>` — children are dropped during JSON serialization of props. Render content inside the example file itself.',
        'Using `share="key"` with a value the receiving component can\'t consume — the example component must accept `{ shared?: Signal<T> }` and fall back to a local signal when undefined. Without that fallback, the example breaks when used WITHOUT `share`.',
      ],
    },
    {
      name: 'registerExamples',
      kind: 'function',
      signature: 'registerExamples(glob: Record<string, () => Promise<unknown>>): void',
      summary:
        'Register the consumer\'s example files for `<Example file="./...">` lookups. Call once at app boot from `entry-client.ts` (or equivalent), passing the result of `import.meta.glob(\'./examples/**/*.tsx\')`. Idempotent: re-registering replaces the previous registry (useful for hot-reload scenarios).',
      example: `// entry-client.ts
import { registerExamples } from '@pyreon/zero-content'
registerExamples(
  import.meta.glob('./examples/⁎⁎/⁎.tsx') as Record<
    string,
    () => Promise<unknown>
  >,
)`,
      mistakes: [
        'Calling `registerExamples` at module scope of a server-only file — the glob must be evaluated in the client bundle. Put it in `entry-client.ts`, not `entry-server.ts`.',
        'Passing the wrong glob shape (resolved path strings instead of loaders) — `import.meta.glob` returns `Record<path, lazy loader>`. Don\'t wrap it.',
        'Forgetting that the glob is COMPILE-TIME-RESOLVED relative to the file. If you `registerExamples(import.meta.glob(\'./x/**/*.tsx\'))` in `src/foo/entry.ts`, the glob walks `src/foo/x/`, NOT `src/x/`.',
      ],
    },
    {
      name: 'getOrCreateSharedSignal',
      kind: 'function',
      signature: 'getOrCreateSharedSignal<T>(key: string, initial: T): Signal<T>',
      summary:
        'Module-level registry of `Signal<T>` instances keyed by string. First lookup for a key creates a signal with the supplied initial value; subsequent lookups return the SAME instance (ignoring `initial` after the first). Powers the `share="key"` prop on `<Example>` but can be used directly for cross-component shared state without a context. Companion `clearAllSharedSignals()` resets the whole registry (test-helper / page-nav use case).',
      example: `import { getOrCreateSharedSignal } from '@pyreon/zero-content'

// Two components on the same page receive the SAME signal:
const a = getOrCreateSharedSignal<number>('cnt', 0)
const b = getOrCreateSharedSignal<number>('cnt', 99)
console.log(a === b) // true
console.log(a()) // 0 (initial from FIRST lookup; second arg ignored)
b.set(5)
console.log(a()) // 5`,
      mistakes: [
        'Disagreeing on `T` across two callers with the same key — both get the same runtime signal but mismatched compile-time types (author error, no runtime safeguard).',
        'Calling `clearAllSharedSignals()` in production (default-page-nav handler etc.) — signals are normally session-scoped; clearing wipes intentional app-wide state (theme/locale/...).',
        'Re-implementing the registry per-feature instead of reusing this — the registry is the canonical home for module-level shared signals across mount boundaries.',
      ],
    },
  ],
})
