---
title: Zero Content
description: Markdown-driven Pyreon sites. Compile-time .md → JSX, typed collections, MDX components, inline live examples.
---

# Zero Content

`@pyreon/zero-content` is the content layer for `@pyreon/zero`. Write `.md` / `.mdx`, get fully-typed content collections, MDX components, syntax-highlighted code, callouts, code-groups, and inline live examples. Powers this docs site.

Tight coupling to zero (no standalone use) — that integration IS the value:

- Markdown pages route through zero's fs-router
- View Transitions API enabled by default
- Theme + dark mode flow through zero's theme system
- Per-route LCP optimization inherits from zero's image/font/script-defer stack

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
// content.config.ts
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

That's it. Add `<root>/.pyreon/**` to `tsconfig.json` `include` for the auto-emitted content types.

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

The schema is your contract. Missing fields fail the build with the file path + field name. The plugin emits `<root>/.pyreon/content-types.d.ts` so `getCollection('docs')` is fully typed.

### Code blocks (Shiki + dual themes)

Every code fence is highlighted by Shiki at build time using BOTH light and dark themes inlined into ONE `<span>` tree. The page's `data-theme` swap flips the visible variant via CSS — zero JS cost, no FOUC.

````md
```ts
import { signal } from '@pyreon/reactivity'
const count = signal(0)
```
````

Custom themes via the plugin:

```ts
// vite.config.ts
content({
  highlighter: {
    themes: { light: pyreonLight, dark: pyreonDark },
  },
})
```

#### Filename labels + line numbers

Code fence meta strings drive the wrapper. Use `filename=`, `showLineNumbers`, and `highlight=` (1-indexed line numbers):

````md
```ts filename=signal.ts showLineNumbers highlight=2-3
const count = signal(0)
count.set(1)
console.log(count())
```
````

The output uses `<CodeBlock filename="signal.ts">` with built-in line-number gutter and highlighted-line `data-*` attributes the consumer's CSS can style.

#### Copy button

Every `<CodeBlock>` ships a copy button. Click copies the original (unhighlighted) source via `navigator.clipboard.writeText()`. SSR-safe (no-op without `clipboard`).

### Code groups (tabbed code blocks)

Show the same task in multiple syntaxes — npm / bun / pnpm, JS / TS, etc. — with one click between tabs. Each child fence carries its label in `[brackets]` after the language:

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

The active tab is a signal; SSR ships tab 0 visible; client-side hydration enables tab switching with **zero per-mount cost** (tabs are CSS class swaps via `data-active`, not VNode reconciliation).

:::warning{title="Mistakes to avoid"}
- Omitting `[label]` on a child fence — silently dropped from the group
- Using `:::code-group` for unrelated languages — it's for the same task in different syntaxes
:::

### Callouts (`:::tip`, `:::warning`, `:::note`, `:::danger`, `:::info`)

Container directives compile to the `<Callout>` built-in. Five types, each with a default icon + title. Pass `{title="…"}` to override.

```md
:::tip{title="Pro tip"}
Use **signals** for fine-grained reactivity. Body content renders through the full markdown pipeline.
:::

:::warning
Forgetting the closing `:::` line silently makes the rest of the file part of the callout. The plugin warns when this is suspected (unclosed-fence heuristic).
:::
```

Unknown callout names get a Levenshtein "did you mean…?" warning at build time. `:::warn` → `:::warning?` is the prototypical fix.

### Internal links

Relative `.md` links rewrite to the collection's route at build:

```md
See the [Reactivity Rules](./reactivity-rules.md) page for details.
```

Absolute paths, `mailto:`, `tel:`, `#anchor`-only, and external URLs all pass through unchanged.

### Local images

`![alt](./hero.png)` rewrites to `<Image src={import('./hero.png?optimize')}>` — pulls Vite's `?optimize` query for responsive `srcset` + lazy loading + blur placeholder. Width/height are required at the type level to prevent CLS.

## MDX components (JSX in markdown)

Three-tier resolution. Drop-file, no imports.

### Tier 1 — built-ins (always available)

| Component        | Purpose                                                                          |
| ---------------- | -------------------------------------------------------------------------------- |
| `<Callout>`      | Tip/warning/note/danger/info box. Auto-emitted by `:::tip` etc.                  |
| `<CodeGroup>`    | Tabbed code blocks. Auto-emitted by `:::code-group`.                             |
| `<CodeBlock>`    | Shiki-highlighted code wrapper. Auto-emitted by fenced code blocks.              |
| `<Tabs>`         | Tabbed content (not code). Author writes the JSX directly.                       |
| `<Details>`      | Native `<details>` wrapper with consistent styling.                              |
| `<PackageBadge>` | Install instructions for a published package (auto-validates the package name). |
| `<APICard>`      | API signature card. Reads from the MCP api-reference at build.                   |
| `<PropTable>`    | Props table. Renders a list of `{ name, type, description }` rows.               |
| `<CompatMatrix>` | Compatibility matrix grid (browser × feature, framework × API, etc.).            |
| `<Image>`        | Responsive image wrapper. Auto-emitted by `![alt](./local.png)`.                 |
| `<Playground>`   | **Deprecated**. Use `<Example>` instead — see below.                             |
| `<Example>`      | Real `.tsx` file mounted inline, with optional cross-mount signal sharing.       |
| `<Math>` / `<Mermaid>` | LaTeX math + Mermaid diagrams.                                           |
| `<PrevNext>` / `<Breadcrumbs>` | Navigation widgets.                                              |

### Tier 2 — convention scan (`src/mdx/**/*.tsx`)

Drop a `.tsx` file under `src/mdx/`. Every PascalCase export is auto-available in markdown by name. No imports needed.

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

Subdirectories are walked. `_`-prefixed files are excluded from the scan (escape hatch for component bundles).

### Tier 3 — per-`.md` import

For one-offs, write a standard ESM import at the top of any markdown file:

```md
import { Foo } from './local-component'

<Foo />
```

Resolution order, most-specific first: per-`.md` import → collection-level `components:` config → top-level `components:` config → `src/mdx/` convention scan → built-ins.

## Inline live examples — `<Example>`

The Pyreon-native replacement for iframe-sandboxed `<Playground>`. Loads a real `.tsx` file inline (NOT iframe) — no escape passes, no srcdoc string-blob, no SyntaxError when a string contains a backslash. **Two `<Example>` calls with the same `share` key receive the SAME signal instance** via a module-level registry, so a click in one example reactively updates the rendered output of another mounted example on the same page.

A killer DX no MDX-flavor framework can replicate. See [Live examples (new DX)](./example-dx) for the full walkthrough; this section is the spec.

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
// src/examples/counter-button.tsx — real Pyreon component
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
| `file`         | `string`             | —                  | Path key into the registered glob. Extension optional (`.tsx`/`.ts`/`.jsx`/`.js`). |
| `share`        | `string` (optional)  | none               | Shared-signal registry key. Two `<Example>` calls with the same `share` get the same signal. |
| `shareInitial` | `unknown` (optional) | `0`                | Initial value for a NEW shared signal. Ignored on subsequent registrations.       |
| `class`        | `string` (optional)  | `'pyreon-example'` | className on the outer wrapper.                                                   |
| `title`        | `string` (optional)  | none               | Optional title shown above the rendered example.                                  |

### Cross-Example signal sharing

- First `<Example share="key">` to mount registers a `Signal<unknown>` with `shareInitial ?? 0`
- Subsequent `<Example share="key">` calls receive the SAME signal as `props.shared`
- The example component MUST accept `{ shared?: Signal<T> }` and fall back to a local signal when undefined (lets the same component work with or without sharing)
- Powered by `getOrCreateSharedSignal(key, initial)` exported from `@pyreon/zero-content`; usable directly for any cross-component shared state without a context

:::tip{title="Why `<Example>` over `<Playground>`?"}
Real `.tsx` files mean real type-checking, real refactor support, real lint. The bug class behind [PR #1434](https://github.com/pyreon/pyreon/pull/1434) — `'\n'` double-unescape through iframe `srcdoc` interpolation throwing `SyntaxError` — becomes structurally impossible. JS escape rules apply once at module evaluation; you write `'\n'` and it's a newline.
:::

## Content collections — typed queries

`getCollection<K>(name)` returns fully-typed entries. The `data` field's type comes from your zod schema via `CollectionSchemas` augmentation (auto-emitted to `.pyreon/content-types.d.ts`).

```ts
// User code anywhere — fully typed from your schema
import { getCollection } from '@pyreon/zero-content'

const docs = await getCollection('docs')
//    ^? Array<{ slug: string; data: { title: string; description: string }; render: () => Promise<ComponentFn> }>

for (const doc of docs) {
  console.log(doc.data.title) // string, typed
  const PageComponent = await doc.render() // ComponentFn — mount it
}
```

`getEntry(name, slug)` for a single entry. `getEntries(name, filter?)` for filtered subsets.

### Collection types

- `type: 'pages'` — routed under `/<collection>/<slug>` via zero's fs-router
- `type: 'data'` — not routed; query-only (use for blog metadata, author info, etc.)

### Default conventions

- Collection name → `src/content/<name>/` (override per-collection via `path:`)
- `<collection>/index.md` → slug `''` → route `/<collection>/` (not `/index/`)
- Subdirectories nest into the slug (`docs/patterns/signals.md` → slug `patterns/signals`)

## Diagnostics

The plugin surfaces non-fatal compile warnings through Vite's `this.warn(...)`:

- **Unknown callout name** — `:::warn` triggers `Unknown callout directive ::: warn — did you mean ::: warning?` (Levenshtein-based suggestion)
- **Unclosed `:::` fence** — when a callout body extends near the file end with many headings, the plugin warns `Suspected unclosed :::tip directive — the body spans N block(s) up to line L. Add a closing ::: line.`
- **Unknown JSX component** — `<Unknown />` fails the build with a `did-you-mean…?` hint from the union of built-ins + `src/mdx/` scan
- **Missing `content.config`** — if you have `.md` files under `src/content/` but no `content.config.{ts,js,mjs}`, the plugin emits a one-time warn at `configResolved` with a copy-paste minimal config

## Reference

Full API in MCP `get_api('@pyreon/zero-content/<name>')` or the package README at [`packages/zero/zero-content/README.md`](https://github.com/pyreon/pyreon/blob/main/packages/zero/zero-content/README.md).

Built-in components: `Callout`, `CodeGroup`, `CodeBlock`, `Tabs`, `Details`, `PackageBadge`, `APICard`, `PropTable`, `CompatMatrix`, `Image`, `Math`, `Mermaid`, `PrevNext`, `Breadcrumbs`, `Example`, `Playground` (deprecated).

Runtime: `defineConfig`, `defineCollection`, `defineComponents`, `defineContentRoute`, `getCollection`, `getEntry`, `getEntries`, `registerExamples`, `getOrCreateSharedSignal`, `clearAllSharedSignals`, `Sidebar`, `Toc`, `Search`, `useSearch`.

See also: [Live examples (new DX)](./example-dx) for the full `<Example>` walkthrough.
