# @pyreon/zero-content

Pyreon Zero's content layer. Compile-time `.md` / `.mdx` → Pyreon JSX, typed content collections (Standard Schema-compatible), convention-scanned MDX components.

Tightly coupled to `@pyreon/zero` — that integration IS the value:

- Markdown pages route through zero's fs-router
- View Transitions API enabled by default
- Theme + dark mode flow through zero's theme system
- Per-route LCP optimization inherits from zero's image/font/script-defer stack

## Status

**v0 — Pre-publish.** The package is currently `private: true` in this monorepo, so a `bun add @pyreon/zero-content` from outside the workspace doesn't resolve yet. Use as a `workspace:*` dep inside the Pyreon repo (see `docs`) or watch this readme for the un-private flip.

## Install

```bash
# inside the Pyreon monorepo (now)
"@pyreon/zero-content": "workspace:*"

# once the package is published (later)
bun add @pyreon/zero-content
```

## Usage

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
// Bring your own Standard Schema validator (zod / valibot / arktype / typia
// all duck-type onto Standard Schema). `@pyreon/zero-content` does NOT
// re-export `z` — see `@pyreon/validation` for curated adapters.
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

Drop `.tsx` files in `src/mdx/` to use them in any markdown by name:

```tsx
// src/mdx/Playground.tsx
export function Playground(props: { initial: string }) { /* ... */ }
```

```md
---
title: Reactivity
description: Signals, computed, effect, batch.
---

# Reactivity

<Playground initial="..." />
```

Typed queries anywhere:

```ts
import { getCollection } from '@pyreon/zero-content'

const docs = await getCollection('docs')
//    ^? Array<{ slug: string; data: { title: string; description: string }; render: () => Promise<ComponentFn> }>
```

## Inline live examples — `<Example>`

Replace iframe-sandboxed `<Playground code={`…`} />` with real `.tsx` files that mount inline (no iframe). Two `<Example>` calls with the same `share` key receive the SAME signal instance, so a click in one example reactively updates the rendered output of another mounted example on the same page — a docs DX no MDX-flavored framework can replicate.

```ts
// entry-client.ts — one-time consumer-side registration
import { registerExamples, startClient } from '@pyreon/zero/client'
import { registerExamples as registerContentExamples } from '@pyreon/zero-content'
import { routes } from 'virtual:zero/routes'

registerContentExamples(
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

Real-file authoring (real type-checking, real refactor support, real lint) closes the foot-gun shape behind PR #1434 — strings like `'\n'` got double-unescaped through iframe `srcdoc` interpolation and threw `SyntaxError`. With `<Example>`, JS escape rules apply once at module evaluation; you write `'\n'` and it's a newline.

**Cross-Example signal sharing** (`share="key"`):

- First `<Example share="key">` to mount registers a `Signal<unknown>` with `shareInitial ?? 0`
- Subsequent `<Example share="key">` calls receive the SAME signal as `props.shared`
- The example component MUST accept `{ shared?: Signal<T> }` and fall back to a local signal when undefined (lets the same component work with or without sharing)
- Powered by `getOrCreateSharedSignal` from `@pyreon/zero-content`; use it directly for any cross-component shared state without a context

**Props**:

| Prop           | Type                 | Default            | Description                                                                                                    |
| -------------- | -------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------- |
| `file`         | `string`             | —                  | Path key into the registered glob. Extension optional (`.tsx`/`.ts`/`.jsx`/`.js` tried in order).               |
| `share`        | `string` (optional)  | none               | Shared-signal registry key. Two `<Example>` calls with the same `share` get the same signal.                   |
| `shareInitial` | `unknown` (optional) | `0`                | Initial value for a NEW shared signal. Ignored on subsequent registrations of the same key.                    |
| `class`        | `string` (optional)  | `'pyreon-example'` | className on the outer wrapper.                                                                                |
| `title`        | `string` (optional)  | none               | Optional title shown above the rendered example.                                                               |

## Conventions

Every path/filename the plugin treats specially, in one place. **`<root>`** is the Vite root.

| Convention                                                  | Purpose                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `<root>/content.config.{ts,mts,js,mjs}`                     | The single source of truth for collections. Auto-discovered at `configResolved`.                 |
| `<root>/src/content/<collection-name>/**/*.{md,mdx}`        | Default location for `type: 'pages'` collection entries (override per-collection via `path:`).   |
| `<collection>/index.md`                                     | Maps to slug `''` so the route is `/docs/` (bare-prefix) instead of `/docs/index/`.              |
| `<root>/src/mdx/**/*.{ts,tsx,js,jsx}`                       | Convention scan for MDX components. PascalCase named/default exports are auto-available by name. |
| `<root>/src/mdx/_*.tsx`                                     | Underscore-prefixed files are **excluded** from the scan — escape-hatch for component bundles.   |
| `<root>/.pyreon/content-types.d.ts`                         | Auto-emitted per-collection schemas. Add `.pyreon/**` to your tsconfig `include`.                |
| `<root>/.pyreon/schemas/<collection>.json`                  | Frontmatter JSON Schema per collection (consumed by the YAML extension via `.vscode-settings`).  |
| `<root>/dist/search-index.json` + `dist/search-index-<name>.json` | Built-time search index emitted at `closeBundle` (chunked per collection).                  |
| **Built-in components**: `<Callout>`, `<CodeGroup>`, `<CodeBlock>` | Always available in any `.md`/`.mdx` — no import needed. Source of truth: `src/_shared/built-ins.ts`. |
| **Markdown directives**: `:::tip`, `:::warning`, `:::note`, `:::danger`, `:::info` | Container directives → `<Callout type="…">`. Unknown names get a `did-you-mean…?` warning; forgetting the closing `:::` triggers an unclosed-fence heuristic. |
| **Markdown directives**: `:::code-group`                    | Tabbed code blocks → `<CodeGroup>`. Each child fence carries its label in `[brackets]`.          |

## Diagnostics

The plugin surfaces non-fatal compile warnings through Vite's `this.warn(...)`:

- **Unknown callout name** — `:::warn` triggers `Unknown callout directive ::: warn — did you mean ::: warning?` (Levenshtein-based suggestion).
- **Unclosed `:::` fence** — when a callout body extends near the file end with many headings, the plugin warns `Suspected unclosed :::tip directive — the body spans N block(s) up to line L. Add a closing ::: line.`
- **Unknown JSX component** — `<Unknown />` fails the build with a `did-you-mean…?` hint from the union of built-ins + `src/mdx/` scan.

## License

MIT
