# @pyreon/zero-content

Pyreon Zero's content layer. Compile-time `.md` / `.mdx` → Pyreon JSX, typed content collections (zod), convention-scanned MDX components.

Tightly coupled to `@pyreon/zero` — that integration IS the value:

- Per-route LCP optimization inherits from zero's image/font/script-defer/resource-hint stack
- Markdown pages route through zero's fs-router via auto-generated catch-all routes
- View Transitions API enabled by default
- Theme + dark mode flow through zero's theme system

## Status

**v0 — Foundation in progress.** See [the plan](../../../.claude/plans/jaunty-herding-kazoo.md) for the 9-PR sequence.

## Install

```bash
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
import { defineConfig, defineCollection, z } from '@pyreon/zero-content'

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

## License

MIT
