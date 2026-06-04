---
title: '@pyreon/head'
description: Declarative document head management for title, meta tags, scripts, styles, and more.
---

`@pyreon/head` provides declarative document `<head>` management for Pyreon applications. Set the page title, meta tags, link tags, scripts, styles, JSON-LD structured data, Speculation Rules (native prefetch/prerender), and HTML/body attributes from any component. Tags are deduplicated by key -- the innermost component wins. Works seamlessly with both client-side rendering (CSR) and server-side rendering (SSR). Supports reactive updates via signal-based getters.

<PackageBadge name="@pyreon/head" href="/docs/head" />

## Installation

::: code-group

```bash [npm]
npm install @pyreon/head
```

```bash [bun]
bun add @pyreon/head
```

```bash [pnpm]
pnpm add @pyreon/head
```

```bash [yarn]
yarn add @pyreon/head
```

:::

## Quick Start

### Client-Side Rendering

For CSR, wrap your application in a `HeadProvider` and use `useHead` in any descendant component:

```tsx
import { HeadProvider, useHead } from '@pyreon/head'
import { mount } from '@pyreon/runtime-dom'

function App() {
  useHead({
    title: 'My App',
    meta: [{ name: 'description', content: 'A Pyreon application' }],
    htmlAttrs: { lang: 'en' },
  })

  return <div>Hello World</div>
}

mount(
  <HeadProvider>
    <App />
  </HeadProvider>,
  document.getElementById('app')!,
)
```

`HeadProvider` auto-creates an internal head context here -- pass `context={createHeadContext()}` explicitly only when you need to share the registry with code outside the provider's subtree (e.g. a custom SSR pipeline that bypasses `renderWithHead`).

### Server-Side Rendering

For SSR, use `renderWithHead` which automatically creates and injects a head context:

```tsx
import { renderWithHead } from '@pyreon/head'

const { html, head, htmlAttrs, bodyAttrs } = await renderWithHead(<App />)

const htmlAttrStr = Object.entries(htmlAttrs)
  .map(([k, v]) => `${k}="${v}"`)
  .join(' ')

const bodyAttrStr = Object.entries(bodyAttrs)
  .map(([k, v]) => `${k}="${v}"`)
  .join(' ')

const page = `<!DOCTYPE html>
<html ${htmlAttrStr}>
  <head>
    <meta charset="UTF-8" />
    ${head}
  </head>
  <body ${bodyAttrStr}>
    <div id="app">${html}</div>
  </body>
</html>`
```

## useHead

Register head tags for the current component. Accepts a static object or a reactive getter function.

### Static Input

When you pass a plain object, the tags are registered once on mount and removed on unmount:

```tsx
function AboutPage() {
  useHead({
    title: 'About Us',
    meta: [
      { name: 'description', content: 'Learn more about our company' },
      { property: 'og:title', content: 'About Us' },
      { property: 'og:description', content: 'Learn more about our company' },
    ],
    link: [{ rel: 'canonical', href: 'https://example.com/about' }],
  })

  return <h1>About Us</h1>
}
```

### Reactive Input

Pass a function to make head tags reactive -- they update whenever signals inside the function change:

```tsx
import { signal } from '@pyreon/reactivity'

function ProductPage() {
  const product = signal({ name: 'Widget', price: 9.99 })

  useHead(() => ({
    title: `${product().name} - $${product().price}`,
    meta: [{ name: 'description', content: `Buy ${product().name} for $${product().price}` }],
  }))

  return <h1>{product().name}</h1>
}
```

On the client, the reactive getter is wrapped in an `effect()` that re-evaluates and re-syncs the DOM whenever dependencies change. On the server, it evaluates once synchronously.

### Signature

```ts
function useHead(input: UseHeadInput | (() => UseHeadInput)): void
```

`useHead` is a no-op if no `HeadProvider` ancestor exists (CSR) or if called outside `renderWithHead` (SSR). It does not throw.

## UseHeadInput

The full input interface for `useHead`:

```ts
interface UseHeadInput {
  title?: string
  titleTemplate?: string | ((title: string) => string)
  meta?: Array<Record<string, string>>
  link?: Array<Record<string, string>>
  script?: Array<{ src?: string; children?: string } & Record<string, string | undefined>>
  style?: Array<{ children: string } & Record<string, string | undefined>>
  noscript?: Array<{ children: string }>
  jsonLd?: Record<string, unknown> | Record<string, unknown>[]
  speculationRules?: SpeculationRules
  base?: Record<string, string>
  htmlAttrs?: Record<string, string>
  bodyAttrs?: Record<string, string>
}
```

## Title

Set the document title:

```tsx
useHead({ title: 'My Page Title' })
```

The title is rendered as a `<title>` tag and also updates `document.title` on the client. Titles are deduplicated by the key `"title"` -- if multiple components set a title, the innermost (last-registered) wins.

### Title Templates

Use `titleTemplate` to apply a consistent suffix or prefix to all page titles. Set it in a layout or root component:

```tsx
// Root layout -- sets the template
function Layout({ children }) {
  useHead({ titleTemplate: '%s | My App' })
  return <div>{children}</div>
}

// Page component -- sets just the title
function AboutPage() {
  useHead({ title: 'About' })
  // Rendered title: "About | My App"
  return <h1>About</h1>
}
```

The `%s` placeholder is replaced with the page title.

### Title Template as a Function

For more control, use a function that receives the raw title and returns the final title:

```tsx
useHead({
  titleTemplate: (title) => {
    if (!title) return 'My App' // no page title set
    return `${title} — My App`
  },
})
```

This is useful for handling edge cases like empty titles or special pages:

```tsx
useHead({
  titleTemplate: (title) => {
    if (title === 'Home') return 'My App' // Home page gets just the app name
    return title ? `${title} | My App` : 'My App'
  },
})
```

The `titleTemplate` uses deduplication -- the innermost component that sets `titleTemplate` wins.

## Meta Tags

Set `<meta>` tags using the `meta` array. Each entry is a record of attribute name to value:

```tsx
useHead({
  meta: [
    { charset: 'UTF-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { name: 'description', content: 'A detailed page description for SEO' },
    { name: 'author', content: 'Jane Doe' },
    { name: 'robots', content: 'index, follow' },
  ],
})
```

### Open Graph Tags

```tsx
useHead({
  meta: [
    { property: 'og:type', content: 'website' },
    { property: 'og:title', content: 'My Page Title' },
    { property: 'og:description', content: 'A description of the page' },
    { property: 'og:image', content: 'https://example.com/image.jpg' },
    { property: 'og:url', content: 'https://example.com/page' },
    { property: 'og:site_name', content: 'My Site' },
    { property: 'og:locale', content: 'en_US' },
  ],
})
```

### Twitter Card Tags

```tsx
useHead({
  meta: [
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:site', content: '@mysite' },
    { name: 'twitter:creator', content: '@author' },
    { name: 'twitter:title', content: 'My Page Title' },
    { name: 'twitter:description', content: 'A description of the page' },
    { name: 'twitter:image', content: 'https://example.com/image.jpg' },
  ],
})
```

### Meta Tag Deduplication

Meta tags are deduplicated by their `name` or `property` attribute. If multiple components set the same meta tag, the innermost component wins:

```tsx
// Layout (outer)
useHead({
  meta: [{ name: 'description', content: 'Default description' }],
})

// Page (inner -- wins)
useHead({
  meta: [{ name: 'description', content: 'Page-specific description' }],
})
// Result: only "Page-specific description" is rendered
```

## Link Tags

Set `<link>` tags using the `link` array:

```tsx
useHead({
  link: [
    { rel: 'canonical', href: 'https://example.com/page' },
    { rel: 'icon', type: 'image/png', href: '/favicon.png' },
    { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
  ],
})
```

### Stylesheets

```tsx
useHead({
  link: [
    { rel: 'stylesheet', href: '/styles/main.css' },
    { rel: 'stylesheet', href: '/styles/theme.css' },
  ],
})
```

Multiple stylesheets with different `href` values are kept (they have different deduplication keys):

```tsx
useHead({
  link: [
    { rel: 'stylesheet', href: '/a.css' },
    { rel: 'stylesheet', href: '/b.css' },
  ],
})
// Both <link> tags are rendered
```

### Preconnect and Preload

```tsx
useHead({
  link: [
    { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
    { rel: 'preload', as: 'font', type: 'font/woff2', href: '/fonts/Inter.woff2', crossorigin: '' },
    { rel: 'preload', as: 'image', href: '/hero.webp' },
    { rel: 'dns-prefetch', href: 'https://analytics.example.com' },
  ],
})
```

### Canonical URL

```tsx
useHead({
  link: [{ rel: 'canonical', href: 'https://example.com/page' }],
})
```

### Link Tag Deduplication

Link tags are deduplicated by a combination of `rel` and `href`. Tags with the same `rel` but different `href` values are kept as separate elements.

## Script Tags

Inject `<script>` tags using the `script` array:

### External Scripts

```tsx
useHead({
  script: [
    { src: 'https://cdn.example.com/analytics.js', async: 'true' },
    { src: 'https://cdn.example.com/widget.js', defer: 'true' },
  ],
})
```

Script tags with a `src` attribute are deduplicated by `src` -- if multiple components inject the same script, only one `<script>` element is created.

### Inline Scripts

```tsx
useHead({
  script: [
    { children: "console.log('Hello from inline script')" },
    {
      children: `
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', 'GA_MEASUREMENT_ID');
      `,
    },
  ],
})
```

Script content is not HTML-escaped in SSR output (since it is raw JavaScript). However, closing `</script>` tags within content are escaped to prevent injection.

### Script with Attributes

```tsx
useHead({
  script: [
    {
      src: 'https://cdn.example.com/sdk.js',
      async: 'true',
      crossorigin: 'anonymous',
      'data-api-key': 'abc123',
    },
  ],
})
```

## Style Tags

Inject inline `<style>` tags:

```tsx
useHead({
  style: [
    { children: 'body { margin: 0; font-family: system-ui, sans-serif; }' },
    { children: '.dark { background: #1a1a1a; color: #fff; }' },
  ],
})
```

### Style with Media Query

```tsx
useHead({
  style: [
    {
      children: '@media print { .no-print { display: none; } }',
      media: 'print',
    },
  ],
})
```

## Noscript Tags

Inject `<noscript>` content for users with JavaScript disabled:

```tsx
useHead({
  noscript: [
    { children: '<p>This application requires JavaScript to run.</p>' },
    { children: '<link rel="stylesheet" href="/noscript.css" />' },
  ],
})
```

## JSON-LD Structured Data

The `jsonLd` property provides a convenience for emitting `<script type="application/ld+json">` tags. The value is automatically `JSON.stringify`'d:

```tsx
useHead({
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Widget Pro',
    description: 'The finest widget available',
    image: 'https://example.com/widget.jpg',
    offers: {
      '@type': 'Offer',
      price: '29.99',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
    },
  },
})
```

### Organization Schema

```tsx
useHead({
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'My Company',
    url: 'https://example.com',
    logo: 'https://example.com/logo.png',
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: '+1-555-0100',
      contactType: 'customer service',
    },
  },
})
```

### Article Schema

```tsx
function ArticlePage({ article }) {
  useHead({
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: article.title,
      author: {
        '@type': 'Person',
        name: article.author,
      },
      datePublished: article.publishedAt,
      dateModified: article.updatedAt,
      image: article.coverImage,
    },
  })

  return <article>{/* ... */}</article>
}
```

### Breadcrumb Schema

```tsx
useHead({
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://example.com' },
      { '@type': 'ListItem', position: 2, name: 'Products', item: 'https://example.com/products' },
      { '@type': 'ListItem', position: 3, name: 'Widget Pro' },
    ],
  },
})
```

JSON-LD tags are deduplicated by the key `"jsonld"` -- if multiple components set JSON-LD, the innermost wins. If you need multiple JSON-LD blocks, use the `script` property directly:

```tsx
useHead({
  script: [
    {
      type: 'application/ld+json',
      children: JSON.stringify({ '@type': 'Organization' /* ... */ }),
    },
    {
      type: 'application/ld+json',
      children: JSON.stringify({ '@type': 'WebPage' /* ... */ }),
    },
  ],
})
```

## Speculation Rules

`speculationRules` is a convenience for the [Speculation Rules API](https://developer.mozilla.org/docs/Web/API/Speculation_Rules_API) — it auto-wraps the object as a `<script type="speculationrules">` tag. Supported browsers **prefetch or fully prerender** the next document(s) in the background, so a real navigation is near-instant. It is opt-in, ships **zero runtime JS**, and is inert (silently ignored) in browsers without support — no polyfill needed.

```tsx
useHead({
  speculationRules: {
    // Fully render these pages in the background, on a moderate trigger.
    prerender: [{ source: 'list', urls: ['/about', '/pricing'], eagerness: 'moderate' }],
    // Or let the browser pick links from the current document by selector.
    prefetch: [
      { source: 'document', where: { selector_matches: 'a[data-prefetch]' }, eagerness: 'conservative' },
    ],
  },
})
```

`eagerness` controls when the browser acts: `'immediate'` / `'eager'` / `'moderate'` (≈ on hover/pointer-down) / `'conservative'` (≈ on pointer-down). `source: 'list'` takes explicit same-origin `urls`; `source: 'document'` takes a `where` predicate (e.g. `{ selector_matches }`, `{ href_matches }`).

> **It is a hint, not a guarantee.** Like `<link rel="prefetch">`, the browser prefetches/prerenders at its own discretion (network conditions, Save-Data, memory). This is **complementary to** `RouterLink`'s `prefetch` prop — that warms loader _data_ for in-app client-side navigation; Speculation Rules warm the _document_ at the platform level for full navigations. Use both. Like JSON-LD, the tag is deduplicated by a single key (`"speculationrules"`) — the innermost component wins; emit one rule set per page.

The script body is JSON and is automatically escaped against `</script>` breakout, so user-derived URLs are safe to include.

## Base Tag

Set the `<base>` tag for relative URL resolution:

```tsx
useHead({
  base: { href: 'https://example.com/' },
})
```

The base tag is deduplicated by the key `"base"`.

## HTML and Body Attributes

Set attributes on the `<html>` and `<body>` elements:

```tsx
useHead({
  htmlAttrs: { lang: 'en', dir: 'ltr' },
  bodyAttrs: { class: 'dark-mode' },
})
```

### Dynamic HTML Attributes

Combine with reactive input for dynamic attributes:

```tsx
import { signal } from '@pyreon/reactivity'

function App() {
  const theme = signal<'light' | 'dark'>('light')

  useHead(() => ({
    htmlAttrs: { lang: 'en' },
    bodyAttrs: {
      class: theme() === 'dark' ? 'dark-mode' : 'light-mode',
      'data-theme': theme(),
    },
  }))

  return (
    <button onClick={() => theme.update((t) => (t === 'light' ? 'dark' : 'light'))}>
      Toggle Theme
    </button>
  )
}
```

### RTL Support

```tsx
useHead(() => ({
  htmlAttrs: {
    lang: locale(),
    dir: ['ar', 'he', 'fa'].includes(locale()) ? 'rtl' : 'ltr',
  },
}))
```

### Attribute Merging

When multiple components set `htmlAttrs` or `bodyAttrs`, the attributes are merged. Later entries override earlier ones for the same attribute name:

```tsx
// Layout
useHead({ htmlAttrs: { lang: 'en', dir: 'ltr' } })

// Page (overrides dir but keeps lang)
useHead({ htmlAttrs: { dir: 'rtl' } })
// Result: <html lang="en" dir="rtl">
```

On the client, attributes managed by Pyreon are tracked with a `data-pyreon-head-attrs` attribute. When a component unmounts and removes its attributes, previously managed attributes that are no longer needed are cleaned up.

## Tag Deduplication and Priority

Tags are deduplicated by their `key`. When multiple components register a tag with the same key, the innermost (last-added) component wins.

### Key Generation Rules

| Tag Type   | Key                            | Example                            |
| ---------- | ------------------------------ | ---------------------------------- |
| `title`    | `"title"`                      | Always `"title"`                   |
| `meta`     | `name` or `property` attribute | `"description"`, `"og:title"`      |
| `link`     | `rel` + `href` combination     | `"link-canonical-https://..."`     |
| `script`   | `src` attribute                | `"https://cdn.example.com/sdk.js"` |
| `style`    | Auto-generated index           | `"style-0"`, `"style-1"`           |
| `noscript` | Auto-generated index           | `"noscript-0"`                     |
| `jsonLd`   | `"jsonld"`                     | Always `"jsonld"`                  |
| `base`     | `"base"`                       | Always `"base"`                    |

### Deduplication Example

```tsx
// Parent layout
function Layout({ children }) {
  useHead({
    title: 'My App',
    meta: [{ name: 'description', content: 'Default description' }],
  })
  return <div>{children}</div>
}

// Child page (innermost wins)
function ProductPage() {
  useHead({
    title: 'Widget Pro',
    meta: [{ name: 'description', content: 'Buy Widget Pro' }],
  })
  return <h1>Widget Pro</h1>
}

// Result:
// <title>Widget Pro</title>
// <meta name="description" content="Buy Widget Pro" />
```

Tags without keys (auto-generated indices) are not deduplicated and are always appended.

## Reactive Head Updates

When using the reactive getter form of `useHead`, the DOM is updated automatically whenever signal dependencies change:

```tsx
import { signal } from '@pyreon/reactivity'

function NotificationBadge() {
  const unreadCount = signal(0)

  useHead(() => ({
    title: unreadCount() > 0 ? `(${unreadCount()}) My App` : 'My App',
  }))

  return (
    <div>
      <span>Unread: {unreadCount()}</span>
      <button onClick={() => unreadCount.update((n) => n + 1)}>New Message</button>
    </div>
  )
}
```

The DOM sync is incremental -- existing elements are matched by key, attributes are patched in place, new elements are added, and stale ones are removed:

```tsx
const description = signal('initial description')

function Page() {
  useHead(() => ({
    meta: [{ name: 'description', content: description() }],
  }))
  return <div />
}

// After mount: <meta name="description" content="initial description" />
description.set('updated description')
// Same DOM element is reused, only content attribute is patched
```

## HeadProvider

The `HeadProvider` component provides a head context to all descendant components. Required for CSR -- `useHead()` is a silent no-op without it.

```tsx
import { HeadProvider } from '@pyreon/head'

function Root() {
  return (
    <HeadProvider>
      <App />
    </HeadProvider>
  )
}
```

### HeadProviderProps

```ts
interface HeadProviderProps {
  context?: HeadContextValue
  children?: VNodeChild
}
```

`HeadProvider` pushes the context frame synchronously during its setup phase, so all descendants -- even those that mount synchronously -- can read the `HeadContext`.

### Context resolution

`HeadProvider` resolves its context in this order, first non-null wins:

1. **`props.context`** -- explicit context. Use this when you need an isolated registry (iframe / micro-frontend boundary) or when manually wiring a custom SSR pipeline.
2. **An outer `HeadContext` already in scope** -- inherited transparently. This is what makes a `HeadProvider` mounted INSIDE `renderWithHead()` (or inside another `HeadProvider`) compose without manual context plumbing. The framework-level [`@pyreon/zero`](/docs/zero) SSG/SSR pipeline relies on this -- its `createApp` mounts `<HeadProvider>` unconditionally, and the outer ctx that `renderWithHead` pushes is inherited.
3. **A freshly-created context** -- root-level fallback for pure CSR.

```tsx
// CSR root — auto-creates a fresh context:
<HeadProvider>
  <App />
</HeadProvider>

// SSR — composes with renderWithHead out of the box:
const { html, head } = await renderWithHead(
  <HeadProvider><App /></HeadProvider>
)

// Explicit isolation (e.g. micro-frontend) — opt out of inheritance:
<HeadProvider context={createHeadContext()}>
  <App />
</HeadProvider>
```

::: warning Nested providers inherit, not isolate
A `HeadProvider` nested inside another one (or inside `renderWithHead`) **inherits** the outer context by default -- both providers write into the same registry. If you genuinely want isolation, pass `context={createHeadContext()}` explicitly. Earlier versions auto-created a fresh context unconditionally, which silently shadowed the outer registry; the inheritance behavior is the structural fix.
:::

## createHeadContext

Create a head context that stores and deduplicates all registered head tags:

```ts
import { createHeadContext } from '@pyreon/head'

const ctx = createHeadContext()
```

### HeadContextValue API

The context object exposes methods for managing head entries:

```ts
interface HeadContextValue {
  /** Add or update an entry identified by a unique symbol */
  add(id: symbol, entry: HeadEntry): void
  /** Remove an entry by its symbol */
  remove(id: symbol): void
  /** Resolve all deduplicated tags (last-added per key wins) */
  resolve(): HeadTag[]
  /** Get the merged titleTemplate */
  resolveTitleTemplate(): string | ((title: string) => string) | undefined
  /** Get merged htmlAttrs */
  resolveHtmlAttrs(): Record<string, string>
  /** Get merged bodyAttrs */
  resolveBodyAttrs(): Record<string, string>
}
```

You typically do not interact with `HeadContextValue` directly -- it is used internally by `useHead`, `HeadProvider`, and `renderWithHead`.

### HeadEntry

```ts
interface HeadEntry {
  tags: HeadTag[]
  titleTemplate?: string | ((title: string) => string)
  htmlAttrs?: Record<string, string>
  bodyAttrs?: Record<string, string>
}
```

### HeadTag

```ts
interface HeadTag {
  tag: 'title' | 'meta' | 'link' | 'script' | 'style' | 'base' | 'noscript'
  key?: string
  props?: Record<string, string>
  children?: string
}
```

## SSR: renderWithHead

`renderWithHead` renders a Pyreon app to HTML and extracts all head tags into a serialized string:

```tsx
import { renderWithHead } from '@pyreon/head'

const result = await renderWithHead(<App />)
```

### RenderWithHeadResult

```ts
interface RenderWithHeadResult {
  /** The rendered HTML body content */
  html: string
  /** Serialized head tags (ready to inject into <head>) */
  head: string
  /** Attributes to set on the <html> element */
  htmlAttrs: Record<string, string>
  /** Attributes to set on the <body> element */
  bodyAttrs: Record<string, string>
}
```

### SSR Template Example

```tsx
async function renderPage(App: ComponentFn): Promise<string> {
  const { html, head, htmlAttrs, bodyAttrs } = await renderWithHead(<App />)

  const htmlAttrStr = Object.entries(htmlAttrs)
    .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
    .join('')

  const bodyAttrStr = Object.entries(bodyAttrs)
    .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
    .join('')

  return `<!DOCTYPE html>
<html${htmlAttrStr}>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${head}
  </head>
  <body${bodyAttrStr}>
    <div id="app">${html}</div>
    <script src="/client.js" defer></script>
  </body>
</html>`
}
```

### SSR Behavior

On the server:

- `useHead` with a static object registers tags synchronously during render
- `useHead` with a reactive getter evaluates the getter once synchronously (no effects on the server)
- `renderWithHead` works with async components -- it awaits `renderToString` before resolving tags
- The `head` string contains properly serialized HTML with escaped entities
- Script and style content is not HTML-escaped (it is raw), but closing tags like `</script>` within content are escaped to prevent injection
- Void tags (`meta`, `link`, `base`) are self-closing (`<meta ... />`)
- The `titleTemplate` is applied to the resolved title in the serialized output

### HTML Escaping in SSR

Title text and meta content are HTML-escaped (`&`, `<`, `>`, `"`):

```tsx
useHead({ title: 'A & B <script>' })
// SSR output: <title>A &amp; B &lt;script&gt;</title>
```

Script and style content is NOT escaped (it is raw JavaScript/CSS), but closing tags are escaped:

```tsx
useHead({ script: [{ children: 'var x = 1 < 2 && 3 > 1' }] })
// SSR output: <script>var x = 1 < 2 && 3 > 1</script>
```

## DOM Synchronization

In CSR mode, `useHead` automatically syncs changes to the real DOM `<head>`. The sync is incremental:

1. Existing elements are matched by their `data-pyreon-head` attribute (which stores the tag key)
2. Matched elements have their attributes patched in place (added, removed, or updated)
3. Matched elements have their text content updated if changed
4. New elements are created and appended to `<head>`
5. Stale elements (no longer in the resolved tag set) are removed

All Pyreon-managed head elements carry a `data-pyreon-head` attribute. This ensures that Pyreon never interferes with elements it did not create.

When a component unmounts, its registered tags are removed from the context and the DOM is re-synced, cleaning up any elements that are no longer needed.

## Integration with Router

Combine `@pyreon/head` with `@pyreon/router` for per-page meta tags:

```tsx
import { useHead } from '@pyreon/head'
import { useRoute } from '@pyreon/router'

function BlogPost() {
  const route = useRoute()

  useHead(() => {
    const slug = route().params.slug
    const post = getPostBySlug(slug)

    return {
      title: post?.title ?? 'Loading...',
      meta: [
        { name: 'description', content: post?.excerpt ?? '' },
        { property: 'og:title', content: post?.title ?? '' },
        { property: 'og:description', content: post?.excerpt ?? '' },
        { property: 'og:image', content: post?.coverImage ?? '' },
        { property: 'og:type', content: 'article' },
        { name: 'twitter:card', content: 'summary_large_image' },
      ],
      link: [{ rel: 'canonical', href: `https://example.com/blog/${slug}` }],
    }
  })

  return <article>{/* ... */}</article>
}
```

## Full Application Example

### SEO-Optimized Layout

```tsx
import { defineComponent } from '@pyreon/core'
import { createHeadContext, HeadProvider, useHead } from '@pyreon/head'

// Root layout with global head configuration
const RootLayout = defineComponent(({ children }) => {
  useHead({
    titleTemplate: '%s | My SaaS App',
    meta: [
      { charset: 'UTF-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: '#4f46e5' },
      { property: 'og:site_name', content: 'My SaaS App' },
      { name: 'twitter:site', content: '@mysaasapp' },
    ],
    link: [
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      { rel: 'icon', type: 'image/png', href: '/favicon.png' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap',
      },
    ],
    htmlAttrs: { lang: 'en' },
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'My SaaS App',
      url: 'https://app.example.com',
    },
  })

  return () => <div class="app-layout">{children}</div>
})

// Individual page with specific meta
const PricingPage = defineComponent(() => {
  useHead({
    title: 'Pricing',
    meta: [
      { name: 'description', content: 'Simple, transparent pricing for teams of all sizes.' },
      { property: 'og:title', content: 'Pricing' },
      {
        property: 'og:description',
        content: 'Simple, transparent pricing for teams of all sizes.',
      },
    ],
    link: [{ rel: 'canonical', href: 'https://app.example.com/pricing' }],
  })

  return () => <main class="pricing">{/* ... */}</main>
})

// App entry point
const headCtx = createHeadContext()

mount(
  <HeadProvider context={headCtx}>
    <RootLayout>
      <PricingPage />
    </RootLayout>
  </HeadProvider>,
  document.getElementById('app')!,
)
```

### Dynamic Page Title from Signal

```tsx
const Dashboard = defineComponent(() => {
  const notifications = signal(0)

  useHead(() => ({
    title: notifications() > 0 ? `(${notifications()}) Dashboard` : 'Dashboard',
  }))

  // Simulate receiving notifications
  setInterval(() => notifications.update((n) => n + 1), 5000)

  return () => (
    <main>
      <h1>Dashboard</h1>
      <span>Notifications: {notifications()}</span>
    </main>
  )
})
```

## Exports Summary

| Export              | Type      | Description                                  |
| ------------------- | --------- | -------------------------------------------- |
| `useHead`           | Function  | Register head tags from a component          |
| `HeadProvider`      | Component | Provide head context to component tree (CSR) |
| `createHeadContext` | Function  | Create a head context store                  |
| `HeadContext`       | Context   | The Pyreon context object (for advanced use) |
| `renderWithHead`    | Function  | SSR: render app with head extraction         |

## Type Exports

| Type                   | Description                             |
| ---------------------- | --------------------------------------- |
| `UseHeadInput`         | Input object for `useHead`              |
| `HeadTag`              | A single head tag definition            |
| `HeadEntry`            | An entry containing tags and attributes |
| `HeadContextValue`     | The context value interface             |
| `HeadProviderProps`    | Props for `HeadProvider`                |
| `RenderWithHeadResult` | Return type of `renderWithHead`         |

## Script Tags & Defer Default

Pyreon's `useHead()` automatically optimizes `<script>` tags for non-blocking page load. External scripts (those with a `src` attribute) default to `defer` unless you explicitly choose a different load strategy.

### Defer by Default: Modern Web Performance

By default, any external script without an explicit load strategy gets `defer`:

```tsx
useHead({
  script: [
    { src: 'https://cdn.example.com/app.js' },
  ],
})
// Renders: <script src="https://cdn.example.com/app.js" defer></script>
```

This aligns with [Lighthouse "Eliminate render-blocking resources"](https://developers.google.com/web/tools/lighthouse) and [Core Web Vitals](https://web.dev/vitals/) — render-blocking scripts harm page load performance and SEO. By deferring by default, Pyreon follows modern best practice: the script fetches in parallel with HTML parsing and executes after the document is ready.

### When the Default is Applied

The defer default is added **only when ALL of these are true:**

1. The script has a `src` attribute (external)
2. No `type` is set (or would default to empty, not a special type)
3. No `async` is set
4. No `defer` is already set

```tsx
useHead({
  script: [
    { src: '/app.js' },  // ✓ Defer applied: <script src="/app.js" defer></script>
    { src: '/app.js', async: '' },  // ✗ Defer NOT applied; author chose async
    { src: '/app.js', defer: '' },  // ✗ Defer NOT applied; already set
    { src: '/app.js', type: 'module' },  // ✗ Defer NOT applied; modules defer by spec
    { src: '/app.js', type: 'importmap' },  // ✗ Defer NOT applied; importmap must run synchronously
  ],
})
```

### Inline Scripts (No `src`)

Inline scripts are **never** modified — they are explicitly synchronous by design:

```tsx
useHead({
  script: [
    { children: 'console.log("runs immediately")' },
  ],
})
// Renders: <script>console.log("runs immediately")</script>  (no defer added)
```

Inline scripts execute synchronously during parsing. If you need async behavior with inline content, use the `async: ''` attribute on an external script file or restructure your code.

### Module Scripts (`type="module"`)

Module scripts are **never** given an explicit `defer` attribute because modules defer by the HTML spec:

```tsx
useHead({
  script: [
    { src: '/app.mjs', type: 'module' },
  ],
})
// Renders: <script src="/app.mjs" type="module"></script>
// (defer is implicit per spec, no need to add it)
```

Module scripts also:
- Parse and execute in document order
- Support `import` / `export` syntax
- Are exempt from `<script>` tag injection and inline `eval()` restrictions under strict CSP

### Import Maps

Import maps **must** execute synchronously and are never deferred, even when they have a `src`:

```tsx
useHead({
  script: [
    { src: '/import-map.json', type: 'importmap' },
  ],
})
// Renders: <script src="/import-map.json" type="importmap"></script>
// (No defer; importmap must run before any module executes)
```

### Async Scripts

Set `async: ''` to load and execute the script as soon as it downloads (parallel to parsing, non-blocking):

```tsx
useHead({
  script: [
    { src: 'https://cdn.example.com/analytics.js', async: '' },
  ],
})
// Renders: <script src="https://cdn.example.com/analytics.js" async></script>
```

The `async` attribute is suitable for independent scripts (analytics, ads) that don't depend on the DOM or other scripts.

### Opting Out: Explicit Author Intent

If you need a render-blocking script (e.g., a critical polyfill), explicitly set `type` or `async` to override the default:

```tsx
// Override by setting type
useHead({
  script: [
    { src: '/critical-polyfill.js', type: '' },  // Explicit empty type disables defer default
  ],
})
// Renders: <script src="/critical-polyfill.js"></script>
// (Blocks parsing; use sparingly and only for critical content)
```

Or use a custom wrapper if you need this pattern frequently:

```tsx
function criticalScript(src: string) {
  return { src, type: '' }  // type: '' blocks the defer default
}

useHead({
  script: [criticalScript('/critical.js')],
})
```

### JSON-LD Structured Data

The `jsonLd` convenience property is unaffected by the defer default — it emits `type="application/ld+json"`, which is not executable JavaScript:

```tsx
useHead({
  jsonLd: {
    '@type': 'Article',
    headline: 'My Post',
  },
})
// Renders: <script type="application/ld+json">{"@type":"Article",...}</script>
// (No defer, because type is set)
```

### Recap: Script Attributes for `useHead`

| Attribute | Type | Purpose |
| --- | --- | --- |
| `src` | string | External script URL |
| `type` | string | MIME type or module type (e.g. `"module"`, `"importmap"`, `"application/ld+json"`) |
| `async` | string | Load asynchronously (blocks on download, not parsing) |
| `defer` | string | Defer execution until document is parsed |
| `crossorigin` | string | CORS mode (`"anonymous"`, `"use-credentials"`) |
| `integrity` | string | Subresource Integrity (SRI) hash |
| `nomodule` | string | Exclude from module-supporting browsers |
| `referrerpolicy` | string | Referrer policy for the fetch |
| `fetchpriority` | string | Fetch priority hint (`"high"`, `"low"`, `"auto"`) |
| `children` | string | Inline script content (mutually exclusive with `src`) |

### Real-World Example

```tsx
function App() {
  useHead({
    script: [
      // Defer applied automatically — analytics can wait
      { src: 'https://cdn.example.com/analytics.js' },
      
      // Async — ad server, independent of page
      { src: 'https://ads.example.com/ads.js', async: '' },
      
      // Module — modern browser feature detection, defers by spec
      { src: '/feature-detect.mjs', type: 'module' },
      
      // Inline — critical config (if truly needed, keep small)
      { children: 'window.config = { apiUrl: "/api" };' },
    ],
  })

  return <div>My App</div>
}
```