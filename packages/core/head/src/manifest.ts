import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/head',
  title: 'Head Management',
  tagline:
    'Reactive `<head>` tag management — useHead(), HeadProvider, renderWithHead() for SSR',
  description:
    'Reactive head tag management for Pyreon — `useHead()` collects title, meta, link, script, style, noscript, base, jsonLd entries from any component in the tree (static or signal-driven). `HeadProvider` collects them on the client and syncs to the live `<head>` element; `renderWithHead()` collects them on the server and returns the serialized HTML alongside the rendered app.',
  category: 'browser',
  features: [
    'useHead(input | () => input) — register head tags from any component',
    'Reactive: pass a function to re-register on signal change',
    'Title templates with %s placeholder or function form',
    'HeadProvider for client-side DOM sync',
    'renderWithHead() for SSR — returns html + head string',
    'Keyed deduplication — innermost component wins per key',
    'JSON-LD shorthand: `jsonLd: {...}` auto-wraps as `<script type="application/ld+json">`',
  ],
  longExample: `import { useHead, HeadProvider } from '@pyreon/head'
import { renderWithHead } from '@pyreon/head'
import { mount } from '@pyreon/runtime-dom'

// Static head tags from any component
function ProfilePage() {
  useHead({
    title: 'My Profile',
    meta: [{ name: 'description', content: 'User profile page' }],
    link: [{ rel: 'canonical', href: 'https://example.com/profile' }],
  })
  return <div>profile body</div>
}

// Reactive head — pass a function so signal reads re-register on change
function ReactiveTitle() {
  useHead(() => ({
    title: \`\${username()} — Profile\`,
    meta: [{ property: 'og:title', content: username() }],
  }))
  return null
}

// Client setup
mount(
  <HeadProvider>
    <App />
  </HeadProvider>,
  document.getElementById('app')!,
)

// Server setup — collects every useHead() call and serializes the head
const { html, head, htmlAttrs, bodyAttrs } = await renderWithHead(<App />)
const document = \`<!doctype html><html\${htmlAttrs}><head>\${head}</head><body\${bodyAttrs}>\${html}</body></html>\``,
  api: [
    {
      name: 'useHead',
      kind: 'hook',
      signature: 'useHead(input: UseHeadInput | (() => UseHeadInput)): void',
      summary:
        'Register head tags from any component in the tree. Pass a static `UseHeadInput` object for one-shot registration, or a `() => UseHeadInput` thunk for reactive re-registration when signal reads inside the thunk change. Calling `useHead()` outside a `HeadProvider` ancestor (CSR) or `renderWithHead()` invocation (SSR) is a silent no-op — it does not throw.',
      example: `// Static:
useHead({ title: "My Page", meta: [{ name: "description", content: "..." }] })

// Reactive (updates when signals change):
useHead(() => ({
  title: \`\${username()} — Profile\`,
  meta: [{ property: "og:title", content: username() }]
}))`,
      mistakes: [
        'Using `${...}` in a `titleTemplate` string — the placeholder is `%s` (or pass a function form `(title) => …`)',
        'Calling `useHead()` outside any `HeadProvider` / `renderWithHead()` boundary — silent no-op, the entries simply go nowhere',
        'Wrapping the input in `computed()` instead of a thunk — pass a plain `() => ({...})` arrow; `useHead` registers its own effect',
        'Expecting `</script>` inside an inline script body to render verbatim — the SSR escaper rewrites it as `<\\/script>` to prevent breaking out of the inline tag',
      ],
      seeAlso: ['HeadProvider', 'renderWithHead'],
    },
    {
      name: 'HeadProvider',
      kind: 'component',
      signature: '(props: HeadProviderProps) => VNodeChild',
      summary:
        'Client-side context provider that collects every `useHead()` call from descendants and syncs the resolved tags into the live `document.head` element. Mount once near the application root. Auto-creates a `HeadContextValue` when no `context` prop is passed; nested providers each own an independent context.',
      example: `<HeadProvider>{children}</HeadProvider>

// Client-side setup:
mount(
  <HeadProvider>
    <App />
  </HeadProvider>,
  document.getElementById("app")!
)`,
      mistakes: [
        'Mounting two `HeadProvider` instances at sibling roots — each owns an independent context, so a `useHead()` deeper in tree A is invisible to tree B',
        'Forgetting to mount `HeadProvider` and expecting `useHead()` to still update `document.head` — silent no-op outside a provider',
      ],
      seeAlso: ['useHead', 'renderWithHead', 'createHeadContext'],
    },
    {
      name: 'renderWithHead',
      kind: 'function',
      signature:
        'renderWithHead(app: VNode): Promise<{ html: string; head: string; htmlAttrs: string; bodyAttrs: string }>',
      summary:
        'SSR companion to `HeadProvider`. Renders the app to HTML via `renderToString` while collecting every `useHead()` call from the tree, then serializes the resolved tags into a single `head` string plus separate `htmlAttrs` / `bodyAttrs` strings. Async components that call `useHead()` in their body work — the renderer awaits suspended subtrees before serialization.',
      example: `import { renderWithHead } from '@pyreon/head'

const { html, head, htmlAttrs, bodyAttrs } = await renderWithHead(<App />)
const doc = \`<!doctype html><html\${htmlAttrs}><head>\${head}</head><body\${bodyAttrs}>\${html}</body></html>\``,
      mistakes: [
        'Awaiting `renderWithHead` and then NOT splicing `head` into the `<head>` element — every `useHead()` call quietly disappears',
        'Forgetting to interpolate `htmlAttrs` / `bodyAttrs` (the leading space is included in each string) — `htmlAttrs.lang` and `bodyAttrs.class` set via `useHead` won\\\'t reach the DOM',
      ],
      seeAlso: ['useHead', 'HeadProvider'],
    },
    {
      name: 'createHeadContext',
      kind: 'function',
      signature: '() => HeadContextValue',
      summary:
        'Manual factory for a `HeadContextValue` — only needed when wiring up a custom SSR pipeline that bypasses `renderWithHead`, or when running multiple isolated head contexts in the same process. The value exposes `add` / `remove` / `resolve` / `resolveTitleTemplate` / `resolveHtmlAttrs` / `resolveBodyAttrs` for full programmatic control.',
      example: `import { createHeadContext, HeadContext } from '@pyreon/head'

const ctx = createHeadContext()
provide(HeadContext, ctx)
// ... render tree that calls useHead() ...
const { tags, htmlAttrs, bodyAttrs } = ctx.resolve()`,
      seeAlso: ['HeadProvider', 'renderWithHead'],
    },
  ],
  gotchas: [
    {
      label: 'Key deduplication',
      note:
        'Tags with the same key replace each other (innermost wins). Meta keys: `name` → `property` → index. Link keys: `href + rel` → `rel` → index. Script keys: `src` → index. Style and noscript are unkeyed and always accumulated.',
    },
    {
      label: 'Inline script escaping',
      note:
        'Script / style / noscript bodies are not HTML-escaped, but the SSR serializer rewrites `</script>` / `</style>` / `</noscript>` and `<!--` to prevent breaking out of the wrapping tag. Inline JSON-LD via `jsonLd: {...}` auto-wraps in `<script type="application/ld+json">` and stringifies the value.',
    },
  ],
})
