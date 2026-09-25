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
  multiplatform: {
    tier: 'web-only',
    rationale:
      'markdown/MDX content pipeline for zero\'s web rendering',
  },
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
      seeAlso: ['getEntry', 'getEntries'],
    },
    {
      name: 'getEntry',
      kind: 'function',
      signature: 'getEntry<K>(name: K, slug: string): Promise<CollectionEntry<CollectionSchemas[K]> | undefined>',
      summary:
        "Sibling of `getCollection` for a SINGLE known slug instead of the whole collection — returns `undefined` (never throws) when the collection name or the slug is not found. Slug match is EXACT (case-sensitive, no trailing-slash normalization).",
      example: `const post = await getEntry('blog', 'my-first-post')
if (post) console.log(post.data.title)`,
      mistakes: [
        'Assuming a trailing-slash or case-insensitive match — the slug lookup is exact; normalize your slug before calling if the source can vary',
        'Not handling `undefined` — the function never throws on a miss, it resolves `undefined`',
      ],
      seeAlso: ['getCollection', 'getEntries'],
    },
    {
      name: 'getEntries',
      kind: 'function',
      signature: 'getEntries<K>(name: K, slugs: string[]): Promise<CollectionEntry<CollectionSchemas[K]>[]>',
      summary:
        'Batch sibling of `getEntry` — resolves multiple entries by slug in parallel. Missing slugs are SILENTLY FILTERED from the result (never throw, never produce a hole) — useful for "related content" widgets where a stale/renamed slug in the data should degrade gracefully rather than break the page.',
      example: `const related = await getEntries('blog', ['post-a', 'post-b', 'post-c'])
// Length may be < 3 if any slug is missing — no error, no gap markers.`,
      mistakes: [
        'Assuming the result array preserves a 1:1 index correspondence with the input `slugs` — a missing slug is DROPPED, not represented as `null`, so the output can be shorter than the input',
      ],
      seeAlso: ['getEntry', 'getCollection'],
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
    {
      name: 'Details',
      kind: 'component',
      signature: '<Details summary?="…" open? class? children>',
      summary:
        'Thin wrapper around native `<details>`/`<summary>` for a collapsible disclosure section. `summary` renders the always-visible label; children render inside the collapsible body. Authored via the `:::details Label` block directive in markdown, or used directly in JSX.',
      example: `// In markdown:
:::details Why?
The full explanation goes here.
:::

// In JSX:
<Details summary="Why?">The full explanation goes here.</Details>`,
      mistakes: [
        'Expecting JS-driven animation — it is the native `<details>` toggle, no transition by default',
      ],
      seeAlso: ['Callout'],
    },
    {
      name: 'Tabs',
      kind: 'component',
      signature: '<Tabs labels={string[]} children? | items={{ label, content }[]} initial?=0 class?>',
      summary:
        'A generic tab strip with one active panel at a time — distinct from `<CodeGroup>` in that labels can be any string and panel content is arbitrary children, not just code. Used for "Install / Use / Configure"-style flows. Two mutually-exclusive shapes: the CHILDREN API (`labels` + parallel `children` array — simple to author from MDX) or the PROPS API (`items: Array<{ label, content }>` — for programmatic tabs from a config/data source).',
      example: `<Tabs labels={['npm', 'bun']}>
  <CodeBlock lang="bash">npm install @pyreon/zero</CodeBlock>
  <CodeBlock lang="bash">bun add @pyreon/zero</CodeBlock>
</Tabs>

// Programmatic:
<Tabs items={[{ label: 'A', content: <div>a</div> }, { label: 'B', content: <div>b</div> }]} />`,
      mistakes: [
        'Passing BOTH `items` AND `labels`/`children` — they are mutually exclusive; `items` (when present) is authoritative',
        'A `labels` array longer than `children` — the extra labels render with `null` panel content rather than erroring',
      ],
      seeAlso: ['CodeGroup'],
    },
    {
      name: 'PropTable',
      kind: 'component',
      signature: '<PropTable rows={PropRow[]} class?> — PropRow: { name, type, default?, required?, description? }',
      summary:
        'Renders a Markdown-style props reference table from a STATIC, author-supplied row list — no runtime introspection, so the table renders identically regardless of environment. Used in API documentation pages, typically paired with `<APICard>`.',
      example: `<PropTable rows={[
  { name: 'children', type: 'VNodeChild', required: true, description: 'The button content.' },
  { name: 'onClick', type: '(e: MouseEvent) => void', description: 'Click handler.' },
  { name: 'disabled', type: 'boolean', default: 'false', description: 'Non-interactive when true.' },
]} />`,
      mistakes: [
        'Expecting it to introspect a real component\'s types — rows are hand-authored; keep them in sync with the actual prop interface manually',
      ],
      seeAlso: ['APICard'],
    },
    {
      name: 'APICard',
      kind: 'component',
      signature: '<APICard name="…" signature?="…" summary?="…" stability?="stable"|"experimental"|"deprecated" since?="…" id?="…" children?>',
      summary:
        'Renders a heading + signature + short description block for ONE API surface entry — the inline structural block authors drop alongside a `<PropTable>` to lock a public API in docs. `id` derives from `name` by default (lowercase, non-alphanumeric → hyphen) for deep-linking; `stability` renders as a badge next to the name.',
      example: `<APICard
  name="getCollection"
  signature="getCollection<K>(name: K, options?: GetCollectionOptions): Promise<Entry[]>"
  summary="Read all entries from a content collection."
>
  <PropTable rows={[/* … */]} />
</APICard>`,
      mistakes: [
        'Omitting `id` on two API cards that derive the SAME anchor slug from similarly-named `name`s — deep links collide; pass an explicit `id` to disambiguate',
      ],
      seeAlso: ['PropTable'],
    },
    {
      name: 'CompatMatrix',
      kind: 'component',
      signature: '<CompatMatrix features={string[]} platforms={string[]} cells={Record<feature, Record<platform, CompatCellValue>>}>',
      summary:
        "Renders a feature × platform compatibility table — one status cell per intersection: ✓ supported, ✗ unsupported, 🚧 partial, ⏳ planned. `CompatCellValue` accepts `true`/`false`/`'partial'`/`'planned'`/any custom string (normalized for display); a missing key at `[feature][platform]` renders an empty cell. Used on adapter/runtime pages to surface what works where.",
      example: `<CompatMatrix
  features={['SSR', 'SSG', 'ISR']}
  platforms={['Node', 'Bun', 'Cloudflare', 'Vercel']}
  cells={{
    SSR: { Node: true, Bun: true, Cloudflare: 'partial', Vercel: true },
    SSG: { Node: true, Bun: true, Cloudflare: true, Vercel: true },
    ISR: { Node: true, Bun: true, Cloudflare: 'planned', Vercel: true },
  }}
/>`,
      mistakes: [
        'Keying `cells` by `[platform][feature]` (swapped) — the lookup is `cells[feature][platform]`, matching the `features`/`platforms` argument order',
      ],
    },
    {
      name: 'PackageBadge',
      kind: 'component',
      signature:
        '<PackageBadge name="…" version?="…" description?="…" managers?={Partial<Record<"bun"|"npm"|"pnpm"|"yarn"|"deno", string>>} hideInstall?>',
      summary:
        'A static panel showing a package name, optional version, and one or more per-package-manager install commands. No network calls, no runtime resolution — authors typically place it at the top of an integration/migration page. Omit a manager key to hide its row; defaults cover bun/npm/pnpm/yarn/deno with their conventional verbs (`add`/`install`).',
      example: `<PackageBadge
  name="@pyreon/zero-content"
  version="0.2.0"
  managers={{ bun: 'add', npm: 'install' }}
/>`,
      mistakes: [
        'Expecting `version` to be resolved automatically from a registry — it is a plain string prop the author supplies',
      ],
    },
    {
      name: 'Mermaid',
      kind: 'component',
      signature: '<Mermaid class? id?>{diagramSource}</Mermaid>',
      summary:
        'Renders a mermaid diagram source string as an SVG. `mermaid` is an OPTIONAL peer dependency — when it is absent (or on the server, before the client-side render completes) the component falls back to a `<pre>` block showing the raw source, so SSR / no-mermaid builds still surface the diagram content instead of a blank area. Authored via the `:::mermaid` block directive in markdown.',
      example: `// In markdown:
:::mermaid
graph TD
  A --> B
:::

// In JSX:
<Mermaid>{\`graph TD\\n  A --> B\`}</Mermaid>`,
      mistakes: [
        'Not installing the `mermaid` peer dependency and expecting a rendered diagram — without it, every `<Mermaid>` falls back to plain source text (by design, not a bug)',
      ],
      seeAlso: ['Math'],
    },
    {
      name: 'Math',
      kind: 'component',
      signature: '<Math inline? class?>{latexSource}</Math>',
      summary:
        'Renders a LaTeX expression via KaTeX. `katex` is an OPTIONAL peer dependency — when absent, falls back to a `<code>` element with the raw source so SSR / no-KaTeX builds still surface the formula text. `inline={true}` renders in `display: inline` mode (KaTeX `displayMode: false`); default is block/display mode. Authored via the `:::math` block directive in markdown.',
      example: `// In markdown:
:::math
E = mc^2
:::

// In JSX, inline:
<Math inline>x^2 + y^2 = r^2</Math>`,
      mistakes: [
        'Not installing the `katex` peer dependency and expecting a rendered formula — without it, every `<Math>` falls back to a plain `<code>` element',
      ],
      seeAlso: ['Mermaid'],
    },
    {
      name: 'Sidebar',
      kind: 'component',
      signature:
        '<Sidebar entries?={SidebarEntry[]} config?={SidebarConfig} currentPath={() => string}> — SidebarEntry: { title, url, group?, order?, badge? }',
      summary:
        "Collection-driven navigation. In the default (auto-grouping) mode, reads each entry's `group`/`order` (typically sourced from frontmatter `sidebar.group`/`sidebar.order`) to build a grouped tree — entries with no `group` fall under an empty-string bucket rendered before the named groups. In CONFIG-DRIVEN mode (`config` prop, takes precedence over `entries`), pinned groups with explicit order skip the auto-grouping pass entirely — useful when navigation structure should be decoupled from per-file frontmatter. Active-link highlighting is automatic and REACTIVE: pass `currentPath` as an accessor so router navigation flips the active item.",
      example: `<Sidebar
  entries={[
    { title: 'Getting Started', url: '/docs/start', group: 'Guides', order: 0 },
    { title: 'API', url: '/docs/api', group: 'Reference', order: 0 },
  ]}
  currentPath={() => router.currentRoute().path}
/>`,
      mistakes: [
        'Passing `currentPath` as a called value (`currentPath={router.currentRoute().path}`) instead of an accessor — active-link highlighting then freezes at the value captured on first render',
        'Mixing `entries` and `config` expecting them to merge — `config` takes precedence outright and skips the frontmatter-derived auto-grouping entirely',
      ],
      seeAlso: ['Breadcrumbs', 'PrevNext'],
    },
    {
      name: 'Breadcrumbs',
      kind: 'component',
      signature: '<Breadcrumbs currentPath={() => string} homeLabel?="Home" homeUrl?="/" entries?={SidebarEntry[]}>',
      summary:
        "Renders a `Home › Section › Page` crumb trail derived from the current URL. Two modes: AUTO (default, no `entries`) derives each segment's label by title-casing the URL path segment (`/docs/getting-started` → `Home › Docs › Getting Started`); LOOKUP (pass `entries` — typically the SAME array given to `<Sidebar>`) resolves each parent segment's title from the matching entry, falling back to auto title-casing for segments with no match. The final segment always renders as plain text (current page, not a link).",
      example: `<Breadcrumbs currentPath={() => router.currentRoute().path} entries={sidebarEntries} />`,
      mistakes: [
        'Expecting every crumb to be clickable — the LAST segment (current page) is deliberately plain text, not a link',
      ],
      seeAlso: ['Sidebar', 'PrevNext'],
    },
    {
      name: 'PrevNext',
      kind: 'component',
      signature: '<PrevNext entries={SidebarEntry[]} currentPath={() => string} labels?={{ previous?, next? }}>',
      summary:
        'Renders "← Previous" / "Next →" links derived from a flattened entry list and the current path — `entries` is typically the SAME array supplied to `<Sidebar>`, so prev/next order matches the sidebar\'s rendered order. Renders empty when the current page is not found in the list. The pure resolution logic is exported separately as `resolvePrevNext(entries, currentPath)` for testing or building a custom prev/next UI.',
      example: `<PrevNext entries={sidebarEntries} currentPath={() => router.currentRoute().path} />`,
      mistakes: [
        'Passing an entries array in a DIFFERENT order than `<Sidebar>` — prev/next then disagrees with the sidebar\'s visual order, confusing readers',
      ],
      seeAlso: ['Sidebar', 'Breadcrumbs'],
    },
    {
      name: 'Toc',
      kind: 'component',
      signature:
        '<Toc headings={Heading[]} class? minLevel?=2 maxLevel?=3 activeSlug?={() => string | null} smoothScroll?=true scrollOffset?=0>',
      summary:
        "Page table-of-contents with scroll-spy: renders a flat list of headings (level 2–3 by default) and tracks which is currently in view via `IntersectionObserver`, flipping `aria-current` + a `.pyreon-toc__link--active` class on the active link. SSR-safe — when `IntersectionObserver` is undefined (no window), the heading list still renders, just without active-tracking (the reactive active-id signal is client-only). `smoothScroll` (default true) makes a click smooth-scroll to the section and update the URL hash instead of a full jump, falling back to native jump when `scrollIntoView` isn't supported; `scrollOffset` compensates for a sticky header.",
      example: `<Toc headings={page.headings} scrollOffset={64} />`,
      mistakes: [
        'Passing a hand-built headings array instead of the one the compiled markdown module exports — the compiler already extracts `headings` with the right slugs; a hand-rolled list can drift from the actual `id` attributes in the rendered page',
      ],
    },
    {
      name: 'Playground',
      kind: 'component',
      signature: '<Playground title? html? css? js? tabs?=false height?=240 class?>',
      summary:
        'DEPRECATED in favor of `<Example>` — flagged by the `pyreon/no-playground-in-docs` lint rule. A minimal sandboxed code playground: renders a `<textarea>` next to a sandboxed `<iframe srcdoc>` that re-renders its body on input. Deliberately narrow scope — no CodeMirror, no Babel/esbuild runtime, just literal HTML/JS/CSS in a sandbox. `<Example>` (type-checked, refactor-safe, cross-mount signal sharing via `share`) structurally supersedes the value this component offered; for richer interactivity (syntax highlighting, autocomplete, multi-file demos) reach for `@pyreon/code` directly instead of either.',
      example: `// Legacy usage — prefer <Example> for new docs:
<Playground title="Hello world" html={'<button id="b">Click</button>'} js={'b.onclick = () => alert("hi")'} />`,
      mistakes: [
        'Authoring NEW docs pages with `<Playground>` — use `<Example file="./examples/…">` instead; `no-playground-in-docs` lints against new usage',
        'Expecting type-checking or a shared signal store — those are `<Example>`-only capabilities this component never had',
      ],
      seeAlso: ['Example'],
    },
    {
      name: 'Search / useSearch',
      kind: 'hook',
      signature:
        "useSearch(options?: UseSearchOptions) => UseSearchResult · <Search catalogUrl? debounceMs?=150 maxResults?=8 minQueryLength?=2> — UseSearchResult: { open, query, results, status: 'idle'|'searching'|'ready', toggle, close }",
      summary:
        "`useSearch` is the headless search state — build a custom search UI on top of it. `<Search />` wraps it with default styling + keyboard shortcuts (⌘K-style open). Both load a MiniSearch index lazily via `loadSearchIndex` (a module-level cache, reference-counted across mounts so it is not re-fetched per component instance) and debounce the query (`debounceMs`, default 150ms) before searching. `status` exists specifically to avoid a \"No results\" flash: `'idle'` (query empty or below `minQueryLength`), `'searching'` (in flight), `'ready'` (a search COMPLETED for the current query — only then is an empty `results` a genuine \"no matches\"). `minQueryLength` defaults to 2 (single letters hit too broad a result set on docs-sized corpora).",
      example: `const search = useSearch({ maxResults: 5 })
search.query.set('signal')
<Show when={() => search.status() === 'ready' && search.results().length === 0}>
  <p>No results.</p>
</Show>

// Or the ready-made overlay:
<Search />`,
      mistakes: [
        'Gating the empty state on `results().length === 0` alone — during the debounce/index-load window results are momentarily empty for a query that WILL match; gate on `status() === \'ready\'` too, as shown above',
        'Building a search index yourself instead of calling `loadSearchIndex` — the module-level cache is what keeps the ~200 KB index from being fetched/parsed once per mounted search UI',
      ],
    },
    {
      name: 'generateSitemap / generateRssFeed / generateLlmsTxt',
      kind: 'function',
      signature: 'generateSitemap(args): string · generateRssFeed(args): string · generateLlmsTxt(args): string',
      summary:
        "DEPRECATED — all three are thin build-script helpers kept for back-compat and superseded by richer `@pyreon/zero` equivalents that run as Vite plugins instead of a hand-written build script: `generateSitemap` → `@pyreon/zero/server`'s `generateSitemap` + `seoPlugin` (adds hreflang/i18n, trailing-slash policy, SSG path-manifest integration; server-only, Vite-plugin-only); `generateRssFeed`/`toRfc822` → the SAME function, re-exported from `@pyreon/zero`'s CLIENT-SAFE main entry (no `/server` needed — no `zero-content` wrapper needed either); `generateLlmsTxt` → `@pyreon/zero/server`'s `aiPlugin` (server-only). These `zero-content` versions will be removed in a future major version — do not build new tooling on them.",
      example: `// Prefer, from @pyreon/zero/server (server-only, Vite plugins):
import { seoPlugin, generateRssFeed, aiPlugin } from '@pyreon/zero/server'`,
      mistakes: [
        "Building new SEO tooling on these zero-content functions — they are deprecated aliases; use @pyreon/zero's seoPlugin/aiPlugin/generateRssFeed instead, which cover strictly more (hreflang, SSG integration, no hand-written build script)",
      ],
    },
  ],
})
