# Head Management

`@pyreon/head` manages document head tags (title, meta, link, script) reactively. Tags declared via `useHead()` are automatically collected for SSR.

## Installation

```bash
bun add @pyreon/head
```

## Quick Start

```tsx
import { HeadProvider, useHead } from "@pyreon/head"

function App() {
  useHead({
    title: "My App",
    meta: [
      { name: "description", content: "A Pyreon application" },
      { property: "og:title", content: "My App" },
    ],
    link: [
      { rel: "canonical", href: "https://example.com" },
    ],
  })

  return (
    <HeadProvider>
      <Layout />
    </HeadProvider>
  )
}
```

## HeadProvider

Wrap your app with `HeadProvider` to enable `useHead()` in descendant components:

```tsx
function Root() {
  return (
    <HeadProvider>
      <App />
    </HeadProvider>
  )
}
```

## useHead

Declare head tags from any component. Tags are merged in component tree order — deeper components override shallower ones for single-value tags like `title`.

```tsx
import { useHead } from "@pyreon/head"

function ProductPage({ product }: { product: Product }) {
  useHead({
    title: product.name,
    meta: [
      { name: "description", content: product.description },
      { property: "og:title", content: product.name },
      { property: "og:image", content: product.imageUrl },
    ],
    link: [
      { rel: "canonical", href: `https://shop.com/p/${product.slug}` },
    ],
  })

  return <div>{/* product content */}</div>
}
```

### UseHeadInput

| Field | Type | Description |
| --- | --- | --- |
| `title` | `string` | Document title |
| `meta` | `HeadTag[]` | `<meta>` tags — name/content or property/content pairs |
| `link` | `HeadTag[]` | `<link>` tags — rel, href, type, etc. |
| `style` | `HeadTag[]` | Inline `<style>` tags |
| `script` | `HeadTag[]` | `<script>` tags — src, type, etc. |

### Reactive Head Tags

Pass signal getters for dynamic head content:

```tsx
function DynamicTitle() {
  const pageTitle = signal("Home")

  useHead({
    title: () => `${pageTitle()} | My App`,
  })

  return <div>{/* content */}</div>
}
```

## SSR — renderWithHead

Capture head tags during server rendering:

```ts
import { renderWithHead } from "@pyreon/head"
import { h } from "@pyreon/core"

const { html, head } = renderWithHead(h(App, null))

const fullHtml = `<!DOCTYPE html>
<html>
<head>${head}</head>
<body><div id="app">${html}</div></body>
</html>`
```

`renderWithHead` calls `renderToString` internally and collects all `useHead()` declarations into a serialized `<title>`, `<meta>`, `<link>` string.

## createHeadContext

For manual integration without `HeadProvider`:

```ts
import { createHeadContext } from "@pyreon/head"

const headCtx = createHeadContext()
// Use with withContext() or pushContext()
```

## Multiple useHead Calls

Multiple components can call `useHead()`. Tags are merged:

```tsx
// Layout.tsx
useHead({ title: "My App" })

// UserPage.tsx (child of Layout)
useHead({ title: "User Profile" })  // overrides title
```

For `title`, the last (deepest) component wins. For `meta`, `link`, etc., tags are appended. Tags with the same `name` or `property` are deduplicated (last wins).

## Gotchas

**`useHead` must be called during component setup.** Like all Pyreon hooks, it cannot be called inside effects or event handlers.

**`HeadProvider` must wrap the component tree.** Without it, `useHead()` calls are silently ignored.

**On the client, head tags are applied to the live DOM.** `useHead()` directly manipulates `document.head`. On the server, tags are collected as strings via `renderWithHead`.
