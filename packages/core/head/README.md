# @pyreon/head

Reactive `<head>` tag management — `useHead()` + `HeadProvider` + SSR `renderWithHead()`.

Register `<title>` / `<meta>` / `<link>` / `<script>` / `<style>` / `<noscript>` / `<base>` / JSON-LD / Speculation Rules entries from ANY component (static or signal-driven via a thunk). `<HeadProvider>` collects them on the client and syncs to the live `document.head`. `renderWithHead()` (subpath `/ssr`) collects them server-side and returns a serialized `head` string plus `htmlAttrs` / `bodyAttrs`. Innermost component wins per key; the inheritance contract makes `<HeadProvider>` mounted inside `renderWithHead()` compose without manual context plumbing.

## Install

```bash
bun add @pyreon/head
```

For SSR you'll also need `@pyreon/runtime-server` (peer).

## Quick start

```tsx
import { HeadProvider, useHead } from '@pyreon/head'
import { renderWithHead } from '@pyreon/head/ssr'
import { mount } from '@pyreon/runtime-dom'

function ProfilePage() {
  useHead({
    title: 'My Profile',
    meta: [
      { name: 'description', content: 'User profile page' },
      { property: 'og:title', content: 'My Profile' },
      { property: 'og:image', content: 'https://example.com/og.jpg' },
    ],
    link: [{ rel: 'canonical', href: 'https://example.com/profile' }],
  })
  return <div>profile body</div>
}

// CSR
mount(
  <HeadProvider>
    <ProfilePage />
  </HeadProvider>,
  document.getElementById('app')!,
)

// SSR — note the /ssr subpath
const { html, head, htmlAttrs, bodyAttrs } = await renderWithHead(<ProfilePage />)
```

## Reactive head — thunk form

Pass a function so signal reads re-register on change:

```tsx
function ReactiveTitle({ username }: { username: () => string }) {
  useHead(() => ({
    title: `${username()} — Profile`,
    meta: [{ property: 'og:title', content: username() }],
  }))
  return null
}
```

Static-object form registers ONCE; thunk form runs an effect that re-registers whenever a tracked signal changes.

## All supported tags

```ts
useHead({
  title: 'Page',
  titleTemplate: '%s | My App', // or: (title) => `${title} | My App`
  meta: [{ name: 'description', content: '...' }],
  link: [{ rel: 'stylesheet', href: '/app.css' }],
  script: [{ src: '/analytics.js', defer: 'true' }],
  style: [{ children: 'body { font-family: sans-serif }' }],
  noscript: [{ children: 'Please enable JavaScript' }],
  base: { href: 'https://example.com/' },
  jsonLd: { '@context': 'https://schema.org', '@type': 'Article', headline: 'Hi' },
  speculationRules: { prefetch: [{ urls: ['/next-page'], eagerness: 'moderate' }] },
  htmlAttrs: { lang: 'en' },
  bodyAttrs: { class: 'dark' },
})
```

`jsonLd: {...}` is shorthand for a `<script type="application/ld+json">` tag with `JSON.stringify` applied. `speculationRules: {...}` is shorthand for `<script type="speculationrules">` — supported browsers prefetch/prerender at their own discretion; inert in non-supporting browsers.

## Title templates

```ts
useHead({ titleTemplate: '%s | My App' })
// Elsewhere:
useHead({ title: 'About' }) // → <title>About | My App</title>

// Function form for full control:
useHead({ titleTemplate: (t) => (t === 'Home' ? 'My App' : `${t} | My App`) })
```

`%s` is the placeholder. Mismatched: `${...}` does NOT interpolate (the `pyreon/lint` rule `i18n-prefer-trans-for-rich-jsx` is a different concern).

## Deduplication

Tags with the same `key` replace each other — innermost component wins.

| Tag                  | Key generation                                   |
| -------------------- | ------------------------------------------------ |
| `title`              | always `'title'`                                 |
| `meta`               | `name` → `property` → `http-equiv` → array index |
| `link`               | `href + rel` → `rel` → index                     |
| `script`             | `src` → index                                    |
| `style` / `noscript` | unkeyed — always accumulated                     |

## HeadProvider — context resolution

`HeadProvider` resolves its context in this order, first non-null wins:

1. **`props.context`** — explicit context (for isolation / custom SSR pipelines)
2. **An outer `HeadContext` already in scope** — inherited transparently
3. **A fresh `HeadContext`** — root-level fallback (pure CSR)

This means `renderWithHead(<HeadProvider><App /></HeadProvider>)` composes correctly without manual plumbing — the outer ctx that `renderWithHead` pushed is inherited by the inner provider. A nested `<HeadProvider>` (e.g. inside another `<HeadProvider>`, or inside a meta-framework's `App` that mounts one unconditionally) **inherits, not isolates**. Pass `context={createHeadContext()}` explicitly when you genuinely want isolation (iframe / micro-frontend boundary).

```tsx
// Default: nested HeadProvider inherits
<HeadProvider>
  <HeadProvider>  {/* same ctx as parent */}
    <App />
  </HeadProvider>
</HeadProvider>

// Opt-out: explicit isolated context
<HeadProvider>
  <HeadProvider context={createHeadContext()}>  {/* isolated ctx */}
    <IsolatedSubApp />
  </HeadProvider>
</HeadProvider>
```

## SSR

```ts
import { renderWithHead } from '@pyreon/head/ssr'

const { html, head, htmlAttrs, bodyAttrs } = await renderWithHead(<App />)

const page = `<!DOCTYPE html>
<html ${htmlAttrs}>
  <head>
    <meta charset="UTF-8" />
    ${head}
  </head>
  <body ${bodyAttrs}>
    <div id="app">${html}</div>
  </body>
</html>`
```

`renderWithHead` (subpath `@pyreon/head/ssr`) creates its own `HeadContext`, runs `renderToString` from `@pyreon/runtime-server`, then serializes the resolved tags. `htmlAttrs` / `bodyAttrs` are space-prefixed strings ready to splice into the opening tags.

**XSS hardening**: inline script/style/noscript bodies are not HTML-escaped (would break the content), but `</script>` / `</style>` / `</noscript>` and `<!--` are rewritten (`<\/script>` etc.) so user content cannot break out of the wrapping tag.

## Subpath exports

```ts
import { useHead } from '@pyreon/head/use-head' // tree-shake fine-grained
import { HeadProvider } from '@pyreon/head/provider' // tree-shake fine-grained
import { renderWithHead } from '@pyreon/head/ssr' // SSR-only
import { HeadContext, createHeadContext } from '@pyreon/head/context' // sub-bundle-stable
```

The main entry re-exports everything from `/use-head` + `/provider` for ergonomics. The `/ssr` entry is intentionally separate so client bundles don't pull in `renderToString` from `@pyreon/runtime-server`.

**`@pyreon/head/context` is the canonical address for `HeadContext`** across every sub-bundle. The build pipeline runs rolldown once per sub-entry (no cross-entry shared chunks), so without externalizing `HeadContext` each sub-bundle minted its own `Symbol` ID and `useContext` lookups silently missed `provide` calls from sibling bundles. Externalizing `/context` gives `HeadContext` a stable runtime address every sub-bundle resolves to. Consumers should rarely need to import directly — but if you wire a custom SSR pipeline that crosses sub-bundles (rare), use `@pyreon/head/context` for the symbol.

## Caveats

- `useHead()` called outside any `HeadProvider` / `renderWithHead` boundary is a **silent no-op** (does not throw).
- `useHead()` inside a `<Suspense>` child does NOT reach the document `<head>` during SSR — the head is flushed in the shell before any boundary resolves. Hoist the call into the layout / shell-level component.
- Speculation Rules are a declarative HINT. Supported browsers prefetch/prerender at their discretion; non-supporting browsers ignore the tag. It is NOT a replacement for `RouterLink prefetch`, which warms loader data.

## Documentation

Full docs: [docs.pyreon.dev/docs/head](https://docs.pyreon.dev/docs/head) (or `docs/docs/head.md` in this repo).

## License

MIT
