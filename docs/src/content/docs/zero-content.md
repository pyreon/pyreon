---
title: Zero Content
description: Markdown-driven Pyreon sites. Compile-time .md → JSX, typed collections, MDX components, callouts, code-groups, Shiki, and inline live examples.
---

`@pyreon/zero-content` is the content layer for `@pyreon/zero`. Author in `.md` / `.mdx` and get fully-typed content collections, MDX components, Shiki-highlighted code, callouts, tabbed code-groups, math + diagrams, search, and inline live examples — all compiled to real Pyreon JSX at build time. It powers this docs site.

<PackageBadge name="@pyreon/zero-content" href="/docs/zero-content" />

Markdown is parsed via the unified + remark ecosystem (the same battle-tested pipeline Astro / Next / Nuxt use) and walked into Pyreon JSX — **not** `dangerouslySetInnerHTML`. Every mdast node maps to a real JSX element, so the compiler's template hoisting, reactive bindings, and tree-shaking all apply to your prose exactly as they do to hand-written components. (The one exception is Shiki-highlighted code: that lands as `dangerouslySetInnerHTML` because re-walking pre-coloured HTML through the emitter would throw away the per-token spans.)

## Tight coupling to zero — and why that's the point

There is no standalone use. The integration with `@pyreon/zero` *is* the value:

- Markdown pages route through zero's fs-router
- View Transitions API enabled by default
- Theme + dark mode flow through zero's theme system
- Per-route LCP optimization inherits from zero's image / font / script-defer stack

The package itself is split into two entry points:

- `@pyreon/zero-content` — **client-safe** runtime: components, `getCollection`, config helpers, `<Search>`, `<Sidebar>`, `<Toc>`. Safe to import from any bundle.
- `@pyreon/zero-content/plugin` — the **Node-only** Vite plugin (pulls in remark / unified / Shiki). Lives in `vite.config.ts` only.

## Quick start

Three files. No additional wiring.

```ts
// vite.config.ts
import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero'
import content from '@pyreon/zero-content/plugin'

export default {
  plugins: [pyreon(), zero(), content()],
}
```

```ts
// content.config.ts (at the project root)
// BYO Standard Schema validator (zod / valibot / arktype / typia)
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
      }),
    }),
  },
})
```

```md
<!-- src/content/docs/getting-started.md -->
---
title: Getting Started
description: How to install and run.
---

# Hello, world!

Your markdown body here.
```

That's it. Add `<root>/.pyreon/**` to your `tsconfig.json` `include` so the auto-emitted content types are picked up.

:::warning{title="The package does NOT re-export zod"}
`@pyreon/zero-content` ships no validator runtime. `import { z } from '@pyreon/zero-content'` does not work — bring your own validator. Any [Standard Schema](https://standardschema.dev)-compatible library duck-types in: zod, valibot, arktype, and typia all work without an adapter. See `@pyreon/validation` for the curated adapters if you want a uniform surface.
:::

### The plugin: configuration

`content()` accepts an options object. Everything is optional — the defaults are tuned for a docs-shaped site.

| Option           | Type                              | Default                  | Description                                                                                  |
| ---------------- | --------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------- |
| `highlight`      | `boolean`                         | `true`                   | Shiki code highlighting. Build-time only — SSR ships pre-rendered HTML, no runtime. Disable for fast preview builds. |
| `highlighter`    | `{ themes?, langs? }`             | github-light/dark        | Shiki theme + language config. See [Custom themes](#custom-themes).                          |
| `mdxDir`         | `string`                          | `<root>/src/mdx`         | Override the convention-scan directory.                                                      |
| `compileJsx`     | `boolean`                         | `true`                   | Run the final esbuild JSX → `h()` pass. Tests set this `false` to assert on raw emit output. |
| `searchBodyMax`  | `number`                          | `1500`                   | Max characters of body text indexed per page for search. `Infinity` disables truncation.    |
| `seo`            | `SeoEmitOptions`                  | none                     | Emit `sitemap.xml` / `rss.xml` / `llms.txt` at build close. See [SEO outputs](#seo-outputs). |

## Markdown syntax

### Frontmatter

YAML at the top, validated against your collection's schema:

```md
---
title: Page title
description: One-line summary
sidebar:
  order: 1
  group: Getting Started
---
```

The schema is your contract. A missing or mistyped field fails the build with the file path + the offending field path + message. The plugin emits `<root>/.pyreon/content-types.d.ts` so `getCollection('docs')` returns fully-typed entries, plus a frontmatter JSON Schema + `.vscode-settings` snippet so any `.md` file gets autocomplete + validation in the editor via the YAML extension.

### Code blocks (Shiki + dual themes)

Every code fence is highlighted by Shiki at build time using BOTH a light and a dark theme inlined into one `<span>` tree. The page's `data-theme` swap flips the visible variant via CSS — zero JS cost, no FOUC.

````md
```ts
import { signal } from '@pyreon/reactivity'
const count = signal(0)
```
````

The shared highlighter is initialized once per build (grammars + themes are expensive to load). The default language set covers `typescript`, `tsx`, `javascript`, `jsx`, `json`, `jsonc`, `bash`, `shell`, `html`, `css`, `scss`, `markdown`, `mdx`, `yaml`, `toml`, `diff`, and `text`. An unknown language falls back to `text` rather than throwing.

#### Custom themes

```ts
// vite.config.ts
content({
  highlighter: {
    themes: { light: pyreonLight, dark: pyreonDark },
    langs: ['typescript', 'rust', 'python'],
  },
})
```

Themes accept either a bundled Shiki theme name (`'github-light'`) or a full theme object. Changing themes in dev triggers a rebuild of the cached highlighter — the first call's themes are not sticky.

#### Filename labels, line numbers, line highlights

The code fence meta string after the language token drives the wrapper. Supported tokens:

| Token                   | Effect                                                                  |
| ----------------------- | ----------------------------------------------------------------------- |
| `filename="config.ts"`  | Visible filename header above the block. `title="…"` is an alias.       |
| `showLineNumbers`       | Renders a left-side line-number gutter.                                 |
| `{1,3-5}`               | Highlight lines (1-indexed). Comma-separated, dash ranges. Deduped + sorted. |
| `noCopy`                | Opt out of the copy button (it ships by default).                       |

Both single and double quotes work for `filename`. Highlight lines use the **brace** form — `{2-3}`, not `highlight=2-3`:

````md
```ts filename=signal.ts showLineNumbers {2-3}
const count = signal(0)
count.set(1)
console.log(count())
```
````

The output is `<CodeBlock filename="signal.ts" showLineNumbers highlightLines={[2,3]}>` carrying `data-lang`, a `code-block__gutter` of `1..N` spans, and a `data-pyreon-highlight-lines="2,3"` attribute your CSS can target. Unknown meta tokens (e.g. `highlight=2-3`) are surfaced as a build warning so the typo doesn't silently no-op.

#### Copy button

Every `<CodeBlock>` ships a copy button unless `noCopy` is set. Click copies the **original, unhighlighted** source via `navigator.clipboard.writeText()` (the raw text is threaded through, not parsed back out of the coloured HTML). The label flips to `Copied` for 2s. SSR-safe — a no-op when `clipboard` is unavailable, and the reset timer is cleared on unmount.

### Code groups (tabbed code blocks)

Show the same task in multiple syntaxes — npm / bun / pnpm, JS / TS — with one click between tabs. Each child fence carries its label in `[brackets]` after the language:

````md
:::code-group
```bash [npm]
npm install @pyreon/zero
```
```bash [bun]
bun add @pyreon/zero
```
```bash [pnpm]
pnpm add @pyreon/zero
```
:::
````

The active tab is a signal; SSR ships tab 0 visible; client-side hydration enables tab switching with **zero per-mount cost** — tabs are CSS class swaps via `data-active`, not VNode reconciliation.

:::warning{title="Code-group gotchas"}
- A child fence with no `[label]` is silently **dropped** from the group. Label every fence.
- A code-group with zero labelled fences emits nothing (rather than a broken `<CodeGroup>`).
- `:::code-group` is for the same task in different syntaxes (npm vs bun vs pnpm), not arbitrary unrelated code.
- Don't nest a `:::code-group` inside a `:::tip` — directives don't nest reliably. Refactor to sibling blocks.
:::

### Callouts (`:::tip`, `:::warning`, `:::note`, `:::danger`, `:::info`)

Container directives compile to the `<Callout>` built-in. Five types, each with a default icon + title.

```md
:::tip{title="Pro tip"}
Use **signals** for fine-grained reactivity. Body content renders through the full markdown pipeline — bold, links, code, lists all work inside.
:::

:::warning
A title is optional; without one the callout uses the type's default title.
:::
```

The body renders through the entire markdown pipeline, so links, emphasis, inline code, and lists all work inside a callout.

:::warning{title="Titles come ONLY from the brace form"}
A custom title MUST be the brace attribute: `:::tip{title="Pro tip"}`. The space form `:::tip Pro tip` is parsed as ordinary body text and the title is silently dropped. (The space form is fine for the **fence itself** — `::: tip` with spaces between `:::` and the name is normalized to `:::tip` — but it cannot carry a title.)
:::

:::warning{title="Close every callout"}
Forgetting the closing `:::` line silently makes the rest of the file part of the callout body. The plugin's unclosed-fence heuristic catches the common case — it warns when a callout's body extends within 3 lines of the file end AND spans ≥ 2 headings (or ≥ 30 child blocks). Add the closing `:::`.
:::

Unknown callout names get a Levenshtein "did you mean…?" suggestion at build time — `:::warn` warns `did you mean :::warning?`. The suggestion fires for plausibly-close typos (small edit distance, or an edit distance under half the longer name); a wildly-different name just lists the valid types.

### Math, diagrams, and disclosures

Three more container directives compile to built-in components. The actual rendering libraries (KaTeX, Mermaid) are dynamically imported on the client — the pipeline only emits the marker.

```md
:::math
E = mc^2
:::

:::math inline
a^2 + b^2 = c^2
:::

:::mermaid
graph TD
  A --> B
:::

:::details Click to expand
Hidden body content.
:::
```

`:::math` and `:::mermaid` extract their body **verbatim from the source** (so `^`, `\`, and `{}` survive markdown's inline processing). `:::math inline` renders inline instead of as a display block. `:::details Label` becomes a native `<details>` / `<summary>` with `Label` as the summary.

### GFM extras

remark-gfm is on, so tables, task lists, strikethrough, autolinks, and footnotes all work and emit native markup:

```md
| Feature   | Status |
| --------- | :----: |
| Tables    | ✅     |

- [x] Done
- [ ] Todo

A claim with a footnote.[^1]

[^1]: The footnote definition.
```

Tables emit `<table>` with per-column `text-align` from the alignment row. Task-list items emit disabled `<input type="checkbox">`. Footnote references and definitions emit linked `<sup>` / `<li>` anchors.

### Internal links

Relative `.md` / `.mdx` links rewrite to the collection's route URL at build:

```md
See the [Reactivity Rules](./reactivity-rules.md) page for details.
```

Any `#anchor` suffix is preserved. Absolute paths, protocol-relative URLs, `mailto:`, `tel:`, `data:`, bare `#anchor`-only fragments, and external URLs all pass through unchanged. Non-`.md` relative paths (`./schema.json`) are left alone too.

### Local images

`![alt](./hero.png)` rewrites to `<Image src={import('./hero.png?optimize')} alt="…">` — pulling Vite's `?optimize` query for responsive `srcset`, lazy loading, and a blur placeholder. Absolute URLs and `data:` URIs fall through to a plain `<img>`. The `Image` built-in is auto-imported for you; you never write the import.

### Headings & the TOC

Heading levels 2–6 are captured into the page's `headings` export (driving `<Toc>`). Each heading gets a slugified `id`; when two headings share text the second is suffixed (`-2`, `-3`) so deep links resolve to the right anchor.

## Inline live examples — `<Example>`

The Pyreon-native replacement for iframe-sandboxed playgrounds. `<Example>` loads a **real `.tsx` file inline** — no iframe, no `srcdoc` string-blob, no escape passes. The example shares the host page's signal graph, runtime, and CSS context.

**Two `<Example>` calls with the same `share` key receive the SAME signal instance** via a module-level registry, so a click in one example reactively updates the rendered output of another mounted example on the same page — a DX no MDX-flavor framework can replicate. See [Live Examples](./live-examples) for the full walkthrough; this section is the spec.

### Quick wiring

```ts
// entry-client.ts — one-time consumer-side registration
import { startClient } from '@pyreon/zero/client'
import { registerExamples } from '@pyreon/zero-content'
import { routes } from 'virtual:zero/routes'

registerExamples(
  import.meta.glob('./examples/**/*.tsx') as Record<
    string,
    () => Promise<unknown>
  >,
)

startClient({ routes })
```

```tsx
// src/examples/counter-button.tsx — a real Pyreon component
import { signal, type Signal } from '@pyreon/reactivity'

export default function CounterButton(props: { shared?: Signal<number> }) {
  const count = props.shared ?? signal(0)
  return (
    <button onClick={() => count.update((n) => n + 1)}>
      bump (now {() => count()})
    </button>
  )
}
```

```md
<!-- In any .md / .mdx page -->
<Example file="./examples/counter-button" share="cnt" />
<Example file="./examples/counter-readout" share="cnt" />
```

### Props

| Prop           | Type                 | Default            | Description                                                                       |
| -------------- | -------------------- | ------------------ | --------------------------------------------------------------------------------- |
| `file`         | `string`             | —                  | Path key into the registered glob. Extension optional (`.tsx` / `.ts` / `.jsx` / `.js`). |
| `share`        | `string` (optional)  | none               | Shared-signal registry key. Two `<Example>` calls with the same `share` get the same signal. |
| `shareInitial` | `unknown` (optional) | `0`                | Initial value for a NEW shared signal. Ignored on subsequent registrations.       |
| `class`        | `string` (optional)  | `'pyreon-example'` | className on the outer wrapper.                                                    |
| `title`        | `string` (optional)  | none               | Optional title rendered above the example.                                        |

### How it mounts

The example loads asynchronously (dynamic `import()` of the resolved chunk). The wrapper shows a thin `aria-busy` placeholder during the load window, then the real component appears — the same pattern Vite uses for any code-split chunk. If `share` is set, the signal is resolved at setup and passed to the loaded component as `props.shared` on every render.

### Cross-Example signal sharing

- The first `<Example share="key">` to mount registers a `Signal<unknown>` seeded with `shareInitial ?? 0`.
- Every subsequent `<Example share="key">` receives the SAME signal as `props.shared`.
- The example component MUST accept `{ shared?: Signal<T> }` and fall back to a local signal when `shared` is undefined — so the same component works with **or** without sharing.
- Powered by `getOrCreateSharedSignal(key, initial)` (exported from `@pyreon/zero-content`), usable directly for any cross-component shared state without a context. `clearAllSharedSignals()` resets the whole registry (test / page-nav use only).

:::tip{title="Why `<Example>` over a string-blob playground?"}
A real `.tsx` file means real type-checking, real refactor support, real lint. The bug class behind [PR #1434](https://github.com/pyreon/pyreon/pull/1434) — a `'\n'` double-unescape through `srcdoc` interpolation throwing `SyntaxError` — becomes structurally impossible. JS escape rules apply once at module evaluation; you write `'\n'` and it's a newline.
:::

:::warning{title="`<Example>` mistakes to avoid"}
- **Forgetting `registerExamples(import.meta.glob(...))`** in `entry-client.ts` — the registry stays empty and every `<Example>` renders the "not found" error. `import.meta.glob` resolves at compile time relative to the file it's called in, so the call MUST live in the consumer's source tree (this package can't do it for you), and the glob walks relative to that file's directory.
- **Passing children** — `<Example file="./x">content</Example>` drops the children during prop serialization. Render content inside the example file itself.
- **A `share` value the component can't consume** — without the `{ shared?: Signal<T> }` fallback, the example breaks when used WITHOUT `share`.
- **Disagreeing on `T`** across two callers with the same `share` key — both get the same runtime signal but mismatched compile-time types (author error, no runtime safeguard).
:::

## MDX components (JSX in markdown)

Three-tier resolution. Drop-file, no imports.

### Tier 1 — built-ins (always available)

Referenced by name in any `.md` file without an import — the pipeline auto-imports them from `virtual:zero-content/components`.

| Component                      | Purpose                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `<Callout>`                    | Tip / warning / note / danger / info box. Auto-emitted by `:::tip` etc.          |
| `<CodeGroup>`                  | Tabbed code blocks. Auto-emitted by `:::code-group`.                             |
| `<CodeBlock>`                  | Shiki-highlighted code wrapper. Auto-emitted by every fenced code block.         |
| `<Tabs>`                       | Tabbed content (not code). Author writes the JSX; `labels` + children, or `items`. |
| `<Details>`                    | Native `<details>` wrapper. Auto-emitted by `:::details`. Props: `summary`, `open`. |
| `<Math>` / `<Mermaid>`         | LaTeX math + Mermaid diagrams. Auto-emitted by `:::math` / `:::mermaid`.          |
| `<PackageBadge>`               | Install instructions for a published package.                                    |
| `<APICard>`                    | API signature card.                                                              |
| `<PropTable>`                  | Props table from `{ name, type, description }` rows.                              |
| `<CompatMatrix>`               | Compatibility-matrix grid (browser × feature, framework × API).                  |
| `<Image>`                      | Responsive image wrapper. Auto-emitted by `![alt](./local.png)`.                 |
| `<Example>`                    | Real `.tsx` file mounted inline, with optional cross-mount signal sharing.       |
| `<Playground>`                 | **Deprecated** — use `<Example>`.                                                |
| `<Sidebar>` / `<Toc>`          | Navigation chrome — grouped sidebar + scroll-spy table of contents.              |
| `<PrevNext>` / `<Breadcrumbs>` | Navigation widgets.                                                              |
| `<Search>`                     | Cmd+K search box (see [Search](#search)).                                        |

### Tier 2 — convention scan (`src/mdx/**/*.{ts,tsx,js,jsx}`)

Drop a file under `src/mdx/`. Every PascalCase export becomes available in markdown by name — no imports.

```tsx
// src/mdx/MyChart.tsx
export default function MyChart(props: { data: number[] }) {
  return <svg>…</svg>
}
```

```md
<!-- in any .md file -->
<MyChart data={[1, 2, 3, 4]} />
```

Discovery rules:

- A PascalCase **default export** is named after the file (`Playground.tsx` → `Playground`) or after its function name (`export default function MyChart`).
- Every PascalCase **named export** (`export const Note`, `export function Card`, `export { Foo }`, `export { X as Bar }`) becomes a component with that name.
- Subdirectories are walked recursively.
- `_`-prefixed files are **excluded** from the scan — the escape hatch for component-bundle files you wire via `defineComponents`.
- Component names MUST be unique across the whole `src/mdx/` tree. A collision keeps the first occurrence and emits a build warning naming every colliding file.
- A user component whose name collides with a built-in (`Playground.tsx`) **overrides** the built-in — the documented escape hatch.

The scan is purely syntactic (regex over source — no type-checking, no import resolution), so it stays fast on large trees. Edits to a `src/mdx/` file HMR-invalidate only the pages that imported that component, not every page.

### Tier 3 — per-`.md` import

For one-offs, write a standard ESM import at the top of any markdown file:

```md
import { Foo } from './local-component'

<Foo />
```

Resolution order, most-specific first: per-`.md` import → collection-level `components:` config → top-level `components:` config → `src/mdx/` convention scan → built-ins.

### `defineComponents` — wiring a component bundle

The `components:` field on a config or collection must be wrapped in `defineComponents` — a plain `{...}` object is **refused at build time** with a fix hint. The wrapper brands the bundle, preserves the literal key set for type inference, and validates every value is a function (catching `{ Foo: undefined }` import typos).

```ts
// src/mdx/_bundle.tsx  (underscore-prefixed: excluded from the auto-scan)
import { defineComponents, mergeComponents } from '@pyreon/zero-content'
import { APIReference } from './api-reference'

const shared = defineComponents({ APIReference })
// content.config.ts can then pass `components: shared` (or merge):
export const docsComponents = mergeComponents(shared /*, more */)
```

`mergeComponents(...)` combines registries, later sources winning on collision; the result stays branded so it's accepted by the config validator.

:::warning{title="`defineComponents` validation runs in production too"}
The "every value must be a function" check runs in BOTH dev and production builds — a `NODE_ENV=production` CI build will still fail loudly on `{ Foo: undefined }`. (The cost is one cheap loop per call.)
:::

## Content collections — typed queries

`getCollection<K>(name)` returns fully-typed entries. The `data` field's type comes from your schema via the `CollectionSchemas` augmentation auto-emitted to `.pyreon/content-types.d.ts`.

```ts
// User code anywhere — fully typed from your schema
import { getCollection } from '@pyreon/zero-content'

const docs = await getCollection('docs')
//    ^? Array<{ slug; data: { title: string; description: string }; render: () => Promise<ComponentFn>; headings }>

for (const doc of docs) {
  console.log(doc.data.title) // string, typed
  const PageComponent = await doc.render() // ComponentFn — mount it
}
```

Each entry exposes `{ slug, data, render(), headings }`. `render()` is async because content modules are lazy-loaded (Vite splits them into per-route chunks).

### `getCollection` options

```ts
const published = await getCollection('blog', {
  includeDrafts: false, // drop entries with `draft: true` in frontmatter
  filter: (e) => e.data.tags?.includes('release'),
})
```

- **`includeDrafts`** — defaults are environment-aware: production builds skip `draft: true` entries (stage a draft in source without leaking it to a public deploy); dev mode shows them. Pass an explicit boolean to override.
- **`filter`** — a predicate run against each entry; return `false` to drop it. Useful for tag listings and date-range filters.

### `getEntry` / `getEntries`

```ts
import { getEntry, getEntries } from '@pyreon/zero-content'

const one = await getEntry('docs', 'getting-started') // CollectionEntry | undefined
const some = await getEntries('blog', ['welcome', 'why-signals']) // missing slugs silently filtered
```

`getEntry` is an exact, case-sensitive slug match with no trailing-slash normalisation. `getEntries` is handy for "see also…" related-content widgets.

:::warning{title="Collection-query mistakes"}
- `getCollection` / `getEntry` / `getEntries` return Promises — `await` them. Call from an async setup function, a loader, or during the SSG render.
- Querying a string that isn't a defined collection throws (and lists the available collections). TypeScript catches it too, once `.pyreon/content-types.d.ts` is generated.
- If the registry isn't wired (no `content.config`, or `virtual:zero-content/collections` never imported), the query throws a self-explanatory "No content collection registry available" error.
:::

### Collection types & conventions

- `type: 'pages'` — routed under `/<collection>/<slug>` via zero's fs-router.
- `type: 'data'` — not routed; query-only (blog metadata, author info, etc.).
- Collection name → `src/content/<name>/` by default; override per-collection with `path:`.
- `<collection>/index.md` → slug `''` → route `/<collection>/` (not `/index/`).
- Subdirectories nest into the slug (`docs/patterns/signals.md` → slug `patterns/signals`).
- When two collection paths nest, the **longest** prefix that is an ancestor of a file wins — deterministic regardless of declaration order.

:::warning{title="`defineConfig` / `defineCollection` mistakes"}
- Wrap each schema in `defineCollection` — the plugin needs the wrapper to know the collection name + type.
- Don't `type: 'pages'` a collection that should not be routed (e.g. blog metadata queried for an index page) — use `type: 'data'`.
- `content.config.{ts,mts,js,mjs}` lives at the project root and must `export default` the `defineConfig(...)` result; the plugin reads the default export.
- A collection's `path` must point at a real directory — the default is `src/content/<name>`.
:::

## `defineContentRoute` — the route helper

A catch-all content route normally needs an async-component + `<Suspense>` + `getStaticPaths` + the registry-import side effect. `defineContentRoute(name)` collapses all of it into one line:

```tsx
// src/routes/docs/[...slug].tsx
import { defineContentRoute } from '@pyreon/zero-content'

export default defineContentRoute('docs')
```

It returns the route's default component (sync wrapper + `<Suspense>` + async body that loads the entry by `[...slug]`), auto-derives `<head>` tags from frontmatter `title` / `description` (including `og:title` / `og:description`), and provides sensible 404 + loading fallbacks. Override surface (all optional):

```tsx
export default defineContentRoute('docs', {
  fallback: <DocLoading />,                       // sync placeholder pre-resolve (or null)
  notFound: ({ slug }) => <My404 slug={slug} />,  // unresolved slug
  wrap: (entry, body) => <Layout entry={entry}>{body}</Layout>,
  articleClass: 'docs-content vp-doc',            // or null to drop the <article>
  head: (entry) => ({ title: entry.data.title }), // or false to skip head emission
})
```

## Search

`<Search>` is a minisearch-backed Cmd+K search box: debounced query, SPA-navigated results, lazy index loading. At build close the plugin writes `dist/search-index.json` (a catalog) + `dist/search-index-<collection>.json` (per-collection chunks); the runtime lazy-fetches the catalog on first open. One search document per page, with heading anchors stored alongside so a hit deep-links to the best-matching section.

In dev there is no build-close step, so the plugin serves `/search-index*.json` from a middleware that transforms the markdown on demand — search works in `vite dev` without a build. Body text is indexed up to `searchBodyMax` characters (default `1500`); raise it for full-text recall on blog-style collections.

## SEO outputs

When `seo` is configured, `closeBundle` writes build artifacts into `dist/`:

```ts
// vite.config.ts
content({
  seo: {
    baseUrl: 'https://example.com',
    sitemap: true,
    rss: { collection: 'blog', title: 'My Blog' },
    llms: { title: 'My Site', description: 'Docs + blog' },
    // collectionUrls: { docs: '/docs', blog: '/blog', drafts: null },
  },
})
```

- `baseUrl` is required for any SEO output (skipped with a warning otherwise).
- `collectionUrls` maps each collection to a URL prefix (defaults to `/<collection>`); set a collection to `null` to exclude it.
- `sitemap: true` emits `sitemap.xml`; `rss` (object form, scoped to one collection) emits `rss.xml`; `llms` emits `llms.txt`.

The same generators (`generateSitemap`, `generateRssFeed`, `generateLlmsTxt`) are exported for use in standalone build scripts without the Vite plugin.

## Diagnostics

The plugin surfaces non-fatal compile warnings via Vite (with a clickable, root-relative file path):

- **Unknown callout name** — `:::warn` warns `Unknown callout directive :::warn — did you mean :::warning?` (Levenshtein-based).
- **Unclosed `:::` fence** — when a callout body extends near the file end across many headings, the plugin warns and asks for the closing `:::`.
- **Unknown component name** — `<Unknown />` fails the build with a "did you mean…?" hint from the union of built-ins + the `src/mdx/` scan.
- **Unknown code-fence meta token** — e.g. `highlight=2-3` warns rather than silently doing nothing (use `{2-3}`).
- **Unhandled mdast node** — a markdown construct the pipeline doesn't yet emit warns at build time (and leaves a grep-able HTML comment) instead of dropping content silently.
- **Missing `content.config`** — markdown under `src/content/` with no `content.config.{ts,mts,js,mjs}` triggers a one-time warning with a copy-paste minimal config.
- **Duplicate `src/mdx/` component name** — warns naming every colliding file.

## API Reference

### Config helpers (`content.config.ts`)

| Export                       | Signature                                                              | Description                                                                 |
| ---------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `defineConfig`               | `defineConfig(config): ContentConfig`                                  | Top-level config factory; preserves literal `collections` types.            |
| `defineCollection`           | `defineCollection<TSchema>({ type, path?, schema, components? })`      | Per-collection definition. `type: 'pages'` routes; `'data'` is query-only.  |
| `defineComponents`           | `defineComponents(map): map & ComponentsRegistry`                      | Brand + validate a component bundle. Throws on non-function values.         |
| `mergeComponents`            | `mergeComponents(...registries): ComponentsRegistry`                   | Merge bundles; later sources win on collision; result stays branded.        |

### Runtime queries

| Export                  | Signature                                                                 | Description                                                       |
| ----------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `getCollection`         | `getCollection<K>(name, opts?): Promise<CollectionEntry[]>`               | All entries; `opts.includeDrafts` (env-aware) + `opts.filter`.   |
| `getEntry`              | `getEntry<K>(name, slug): Promise<CollectionEntry \| undefined>`          | One entry by exact slug.                                         |
| `getEntries`            | `getEntries<K>(name, slugs): Promise<CollectionEntry[]>`                  | Multiple by slug; missing slugs filtered.                        |
| `defineContentRoute`    | `defineContentRoute(name, opts?): ComponentFn`                           | Collapse the catch-all-route Suspense boilerplate into one call. |

### Live examples

| Export                    | Signature                                                            | Description                                                              |
| ------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `Example`                 | `<Example file share? shareInitial? title? class? />`                | Mount a real `.tsx` file inline, with optional cross-mount signal share. |
| `registerExamples`        | `registerExamples(glob): void`                                       | Register `import.meta.glob('./examples/**/*.tsx')` at app boot (idempotent). |
| `getOrCreateSharedSignal` | `getOrCreateSharedSignal<T>(key, initial): Signal<T>`                | Module-level shared-signal registry. First lookup creates; rest reuse.   |
| `clearAllSharedSignals`   | `clearAllSharedSignals(): void`                                      | Reset the shared-signal registry (test / page-nav only).                 |

### Components

| Export                                | Description                                                              |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `Callout`                             | Tip/warning/note/danger/info box. `type`, `title?`.                      |
| `CodeGroup`                           | Tabbed code blocks. `labels`, `initial?`.                                |
| `CodeBlock`                           | Shiki wrapper. `lang?`, `filename?`, `showLineNumbers?`, `highlightLines?`, `source?`, `copyable?`, `dangerouslySetInnerHTML`. |
| `Tabs`                                | Tabbed content. `labels` + children, or `items`; `initial?`.             |
| `Details`                             | `<details>` wrapper. `summary?`, `open?`.                                |
| `Math` / `Mermaid`                    | LaTeX / diagrams. `children` (string), `inline?` (Math).                 |
| `PackageBadge`                        | Install panel. `name`, `version?`, `description?`, `managers?`, `hideInstall?`. |
| `APICard` / `PropTable` / `CompatMatrix` | API + prop + compatibility tables.                                    |
| `Image`                               | Responsive image. Auto-emitted by local `![alt](./img)`.                 |
| `Sidebar` / `Toc`                     | Grouped sidebar + scroll-spy TOC.                                        |
| `PrevNext` / `Breadcrumbs`            | Navigation widgets.                                                      |
| `Search`                              | Cmd+K minisearch box; `useSearch` is the headless hook.                  |

### Build outputs (callable standalone)

| Export                | Description                              |
| --------------------- | ---------------------------------------- |
| `generateSitemap`     | Build a `sitemap.xml` string.            |
| `generateRssFeed`     | Build an RSS 2.0 feed string.            |
| `generateLlmsTxt`     | Build an `llms.txt` string.              |

### Directive reference

| Markdown                       | Compiles to                                     |
| ------------------------------ | ----------------------------------------------- |
| `:::tip` … `:::`               | `<Callout type="tip">`                          |
| `:::tip{title="…"}` … `:::`    | `<Callout type="tip" title="…">`                |
| `:::warning` / `note` / `danger` / `info` | `<Callout type="…">`                 |
| `:::code-group` + `[label]` fences | `<CodeGroup labels={[…]}>`                  |
| `:::math` … `:::`              | `<Math>…</Math>` (display)                       |
| `:::math inline` … `:::`       | `<Math inline>…</Math>`                          |
| `:::mermaid` … `:::`           | `<Mermaid>…</Mermaid>`                           |
| `:::details Label` … `:::`     | `<Details summary="Label">…</Details>`          |
| ` ```ts {1,3-5} filename=x showLineNumbers ` | `<CodeBlock …>` (Shiki HTML)      |

## Reference

Full API in MCP `get_api('@pyreon/zero-content/<name>')` or the package README at [`packages/zero/zero-content/README.md`](https://github.com/pyreon/pyreon/blob/main/packages/zero/zero-content/README.md).

See also: [Live Examples](./live-examples) for the full `<Example>` walkthrough.
