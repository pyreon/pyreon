---
title: "Head Management — API Reference"
description: "Reactive `<head>` tag management — useHead(), HeadProvider, renderWithHead() for SSR"
---

# @pyreon/head — API Reference

> **Generated** from `head`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [head](/docs/head).

Reactive head tag management for Pyreon — `useHead()` collects title, meta, link, script, style, noscript, base, jsonLd entries from any component in the tree (static or signal-driven). `HeadProvider` collects them on the client and syncs to the live `<head>` element; `renderWithHead()` collects them on the server and returns the serialized HTML alongside the rendered app. External `<script>` tags (those with `src`) default to `defer` for non-blocking page load — module scripts, import maps, and inline scripts are left untouched; the `ScriptTag` type carries the full attribute surface (`integrity` / `nomodule` / `referrerpolicy` / `fetchpriority` / …).

## Features

- useHead(input | () =&gt; input) — register head tags from any component
- Reactive: pass a function to re-register on signal change
- Title templates with %s placeholder or function form
- HeadProvider for client-side DOM sync
- renderWithHead() for SSR — returns html + head string
- Keyed deduplication — innermost component wins per key
- JSON-LD shorthand: `jsonLd: {...}` auto-wraps as `<script type="application/ld+json">`
- Speculation Rules shorthand: `speculationRules: {...}` auto-wraps as `<script type="speculationrules">` — native browser prefetch/prerender, opt-in
- useHead(&#123; script &#125;) — external scripts default to defer for non-blocking load; ScriptTag carries the full attribute surface (integrity / nomodule / fetchpriority / …)

## Complete example

A full, end-to-end usage of the package:

```tsx
import { useHead, HeadProvider } from '@pyreon/head'
import { renderWithHead } from '@pyreon/head/ssr'
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
    title: `${username()} — Profile`,
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

// Server setup — collects every useHead() call and serializes the head.
// htmlAttrs / bodyAttrs are Record<string, string> — serialize to attribute strings:
const { html, head, htmlAttrs, bodyAttrs } = await renderWithHead(<App />)
const attrs = (r: Record<string, string>) =>
  Object.entries(r).map(([k, v]) => ` ${k}="${v}"`).join('')
const page = `<!doctype html><html${attrs(htmlAttrs)}><head>${head}</head><body${attrs(bodyAttrs)}>${html}</body></html>`
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`useHead`](#usehead) | hook | Register head tags from any component in the tree. |
| [`HeadProvider`](#headprovider) | component | Context provider that collects every `useHead()` call from descendants. |
| [`renderWithHead`](#renderwithhead) | function | SSR companion to `HeadProvider`, exported from the `@pyreon/head/ssr` subpath (kept out of the client entry). |
| [`createHeadContext`](#createheadcontext) | function | Manual factory for a `HeadContextValue` — only needed when wiring up a custom SSR pipeline that bypasses `renderWithHead |
| [`ScriptTag`](#scripttag) | type | Standard `<script>` tag attributes passed to `useHead({ script: [...] })`. |

## API

### useHead `hook`

```ts
useHead(input: UseHeadInput | (() => UseHeadInput)): void
```

Register head tags from any component in the tree. Pass a static `UseHeadInput` object for one-shot registration, or a `() => UseHeadInput` thunk for reactive re-registration when signal reads inside the thunk change. Calling `useHead()` outside a `HeadProvider` ancestor (CSR) or `renderWithHead()` invocation (SSR) is a silent no-op — it does not throw.

**Example**

```tsx
// Static:
useHead({ title: "My Page", meta: [{ name: "description", content: "..." }] })

// Reactive (updates when signals change):
useHead(() => ({
  title: `${username()} — Profile`,
  meta: [{ property: "og:title", content: username() }]
}))
```

**Common mistakes**

- Using `${...}` in a `titleTemplate` string — the placeholder is `%s` (or pass a function form `(title) => …`)
- Calling `useHead()` outside any `HeadProvider` / `renderWithHead()` boundary — silent no-op, the entries simply go nowhere
- Wrapping the input in `computed()` instead of a thunk — pass a plain `() => ({...})` arrow; `useHead` registers its own effect
- Expecting `</script>` inside an inline script body to render verbatim — the SSR escaper rewrites it as `<\/script>` to prevent breaking out of the inline tag
- Treating `speculationRules` as a guaranteed perf win — it is a declarative HINT (like `<link rel=prefetch>`); supported browsers prefetch/prerender at their own discretion, unsupported ones ignore it. It is opt-in and zero-runtime-JS; it does not replace `RouterLink prefetch` (which warms loader data for client-side nav)

**See also:** `HeadProvider` · `renderWithHead`

---

### HeadProvider `component`

```ts
(props: HeadProviderProps) => VNodeChild
```

Context provider that collects every `useHead()` call from descendants. Resolves its context as `props.context ?? outer HeadContext in scope ?? a fresh one`, so a `HeadProvider` mounted INSIDE `renderWithHead()` (or inside another `HeadProvider`) transparently inherits the outer registry instead of shadowing it with a write-only one. On the client it also syncs the resolved tags into the live `document.head`. Mount once near the application root for the canonical CSR shape; the inheritance step makes nested mounts and the SSR-wrapped shape work without manual context plumbing.

**Example**

```tsx
<HeadProvider>{children}</HeadProvider>

// CSR root — auto-creates a fresh context:
mount(
  <HeadProvider>
    <App />
  </HeadProvider>,
  document.getElementById("app")!
)

// SSR — composes with renderWithHead out of the box (no context prop needed):
const { html, head } = await renderWithHead(
  <HeadProvider><App /></HeadProvider>
)

// Explicit isolation (iframe / micro-frontend boundary):
<HeadProvider context={createHeadContext()}><App /></HeadProvider>
```

**Common mistakes**

- Mounting two `HeadProvider` instances at SIBLING roots — each owns an independent context, so a `useHead()` deeper in tree A is invisible to tree B (use a shared `context` prop or merge under a common parent provider)
- Forgetting to mount `HeadProvider` (or `renderWithHead`) and expecting `useHead()` to still update `document.head` — silent no-op outside any provider
- Assuming a NESTED `HeadProvider` isolates its subtree by default — it does the opposite, inheriting the outer context. Pass `context={createHeadContext()}` explicitly when you genuinely want isolation

**See also:** `useHead` · `renderWithHead` · `createHeadContext`

---

### renderWithHead `function`

```ts
renderWithHead(app: VNode): Promise<{ html: string; head: string; htmlAttrs: Record<string, string>; bodyAttrs: Record<string, string> }>
```

SSR companion to `HeadProvider`, exported from the `@pyreon/head/ssr` subpath (kept out of the client entry). Renders the app to HTML via `renderToString` while collecting every `useHead()` call from the tree, then serializes the resolved tags into a single `head` string. `htmlAttrs` / `bodyAttrs` are returned as `Record<string, string>` objects (e.g. `{ lang: "en" }`) — serialize them into attribute strings yourself. Async components that call `useHead()` in their body work — the renderer awaits suspended subtrees before serialization.

**Example**

```tsx
import { renderWithHead } from '@pyreon/head/ssr'

const { html, head, htmlAttrs, bodyAttrs } = await renderWithHead(<App />)
// htmlAttrs / bodyAttrs are Record<string, string> — serialize to attribute strings:
const attrs = (r: Record<string, string>) =>
  Object.entries(r).map(([k, v]) => ` ${k}="${v}"`).join('')
const doc = `<!doctype html><html${attrs(htmlAttrs)}><head>${head}</head><body${attrs(bodyAttrs)}>${html}</body></html>`
```

**Common mistakes**

- Importing `renderWithHead` from `@pyreon/head` — it lives in the `@pyreon/head/ssr` subpath so the base entry stays client-safe
- Awaiting `renderWithHead` and then NOT splicing `head` into the `<head>` element — every `useHead()` call quietly disappears
- Interpolating `htmlAttrs` / `bodyAttrs` directly (`<html${htmlAttrs}>`) — they are `Record<string, string>` objects, not strings; interpolating them renders `[object Object]`. Serialize the entries first

**See also:** `useHead` · `HeadProvider`

---

### createHeadContext `function`

```ts
() => HeadContextValue
```

Manual factory for a `HeadContextValue` — only needed when wiring up a custom SSR pipeline that bypasses `renderWithHead`, or when running multiple isolated head contexts in the same process. The value exposes `add` / `remove` / `resolve` / `resolveTitleTemplate` / `resolveHtmlAttrs` / `resolveBodyAttrs` for full programmatic control.

**Example**

```tsx
import { createHeadContext, HeadContext } from '@pyreon/head'

const ctx = createHeadContext()
provide(HeadContext, ctx)
// ... render tree that calls useHead() ...
const tags = ctx.resolve()                 // HeadTag[]
const htmlAttrs = ctx.resolveHtmlAttrs()   // Record<string, string>
const bodyAttrs = ctx.resolveBodyAttrs()   // Record<string, string>
```

**See also:** `HeadProvider` · `renderWithHead`

---

### ScriptTag `type`

```ts
interface ScriptTag { src?: string; type?: string; async?: string; defer?: string; crossorigin?: string; integrity?: string; nomodule?: string; referrerpolicy?: string; fetchpriority?: string; children?: string }
```

Standard `<script>` tag attributes passed to `useHead({ script: [...] })`. External scripts (with `src`) default to `defer=''` unless the author explicitly sets `type` (e.g. `module`), `async`, or `defer`. This prevents render-blocking—aligns with Lighthouse / Core Web Vitals best practice. Inline scripts (no `src`) are never touched; `type="module"` and `type="importmap"` skip the defer default per HTML spec (modules defer by spec; importmap executes synchronously).

**Example**

```tsx
// External script auto-gets defer unless author overrides
useHead({
  script: [
    { src: '/app.js' },  // becomes: <script src="/app.js" defer></script>
    { src: '/async.js', async: '' },  // author intent: <script src="/async.js" async></script>
    { src: '/module.js', type: 'module' },  // module defers by spec: <script src="/module.js" type="module"></script>
    { children: 'console.log(1)' },  // inline: <script>console.log(1)</script> (no defer added)
  ]
})
```

**Common mistakes**

- Wrapping external scripts in `defer: 'true'` (boolean string) — use `defer: ''` (empty string) or omit it and let the default apply
- Assuming inline scripts get deferred — they don't; defer only applies to external src + no explicit load strategy
- Setting `type="module"` expecting defer to be added — modules are deferred by spec; adding defer is a no-op (and the code skips it)
- Passing `type="text/javascript"` or `type="application/javascript"` then expecting defer — the `type` field blocks the default; use no `type` attr to get the default
- Expecting JSON-LD via `jsonLd` convenience property to be affected by defer logic — `jsonLd` auto-wraps as `type="application/ld+json"`, so defer is never added (type blocks it)

**See also:** `UseHeadInput` · `useHead`

---

## Package-level notes

> **Key deduplication:** Tags with the same key replace each other (innermost wins). Meta keys: `name` → `property` → index. Link keys: `href + rel` → `rel` → index. Script keys: `src` → index. Style and noscript are unkeyed and always accumulated.

> **Inline script escaping:** Script / style / noscript bodies are not HTML-escaped, but the SSR serializer rewrites `</script>` / `</style>` / `</noscript>` and `<!--` to prevent breaking out of the wrapping tag. Inline JSON-LD via `jsonLd: {...}` auto-wraps in `<script type="application/ld+json">` and stringifies the value.
