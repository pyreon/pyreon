/**
 * @pyreon/runtime-server — SSR/SSG renderer for Pyreon.
 *
 * Walks a VNode tree and produces HTML strings.
 * Signal accessors (reactive getters `() => value`) are called synchronously
 * to snapshot their current value — no effects are set up on the server.
 *
 * Async components (`async function Component()`) are fully supported:
 * renderToString will await them before continuing the tree walk.
 *
 * API:
 *   renderToString(vnode)   → Promise<string>
 *   renderToStream(vnode)   → ReadableStream<string>
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import type { ClassValue, ComponentFn, ForProps, VNode, VNodeChild } from '@pyreon/core'
import {
  cx,
  ForSymbol,
  Fragment,
  normalizeStyleValue,
  runWithHooks,
  Suspense,
  setContextStackProvider,
} from '@pyreon/core'

const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'

// Dev-mode perf counter sink. Zero coupling to @pyreon/perf-harness — we just
// call the global if it's installed. Guarded on __DEV__ so NODE_ENV=production
// short-circuits at runtime; @pyreon/runtime-server is a server package, so the
// `typeof process` gate is correct here (not `import.meta.env.DEV`, which is a
// browser-bundler concern). See .claude/rules/test-environment-parity.md.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

// ─── Streaming Suspense context ───────────────────────────────────────────────
// Tracks in-flight async Suspense boundary resolutions within a single stream.

interface StreamCtx {
  pending: Promise<void>[]
  nextId: () => number
  mainEnqueue: (s: string) => void
  /** Depth counter — non-zero when rendering inside a Suspense child resolution. */
  suspenseDepth: number
}

const _streamCtxAls = new AsyncLocalStorage<StreamCtx>()

// ─── Concurrent SSR context isolation ────────────────────────────────────────
// Each renderToString call runs in its own ALS store (a fresh empty stack[]).
// Concurrent requests never share context frames.

const _contextAls = new AsyncLocalStorage<Map<symbol, unknown>[]>()
const _fallbackStack: Map<symbol, unknown>[] = []

setContextStackProvider(() => _contextAls.getStore() ?? _fallbackStack)

// ─── Store isolation (optional) ───────────────────────────────────────────────
// A second ALS isolates store registries between concurrent requests.
// Activated only when the user calls configureStoreIsolation().

const _storeAls = new AsyncLocalStorage<Map<string, unknown>>()
let _storeIsolationActive = false

/**
 * Wire up per-request store isolation.
 * Call once at server startup, passing a `setStoreRegistryProvider` function.
 *
 * @example
 * import { configureStoreIsolation } from "@pyreon/runtime-server"
 * configureStoreIsolation(setStoreRegistryProvider)
 */
export function configureStoreIsolation(
  setStoreRegistryProvider: (fn: () => Map<string, unknown>) => void,
): void {
  setStoreRegistryProvider(() => _storeAls.getStore() ?? new Map())
  _storeIsolationActive = true
}

/** Wrap a function call in a fresh store registry (no-op if isolation not configured). */
function withStoreContext<T>(fn: () => T): T {
  if (!_storeIsolationActive) return fn()
  return _storeAls.run(new Map(), fn)
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Render a VNode tree to an HTML string. Supports async component functions. */
export async function renderToString(root: VNode | null): Promise<string> {
  if (root === null) return ''
  if (__DEV__) _countSink.__pyreon_count__?.('runtime-server.render')
  // Each call gets a fresh isolated context stack and (optionally) store registry
  return withStoreContext(() => _contextAls.run([], () => renderNode(root)))
}

/**
 * Run an async function with a fresh, isolated context stack and store registry.
 * Useful when you need to call Pyreon APIs (e.g. useHead, prefetchLoaderData)
 * outside of renderToString but still want per-request isolation.
 */
export function runWithRequestContext<T>(fn: () => Promise<T>): Promise<T> {
  return withStoreContext(() => _contextAls.run([], fn))
}

/**
 * Render a VNode tree to a Web-standard ReadableStream of HTML chunks.
 *
 * True progressive streaming: HTML is flushed to the client as soon as each
 * node is ready. Synchronous subtrees are enqueued immediately; async component
 * boundaries are awaited in-order and their output is enqueued as it resolves.
 *
 * Suspense boundaries are streamed out-of-order: the fallback is emitted
 * immediately, and the resolved children are sent as a `<template>` + inline
 * swap script once ready — without blocking the rest of the page.
 *
 * Each renderToStream call gets its own isolated ALS context stack.
 */
export function renderToStream(root: VNode | null): ReadableStream<string> {
  if (__DEV__) _countSink.__pyreon_count__?.('runtime-server.stream')
  return new ReadableStream<string>({
    start(controller) {
      const enqueue = (chunk: string) => controller.enqueue(chunk)
      let bid = 0
      const ctx: StreamCtx = {
        pending: [],
        nextId: () => bid++,
        mainEnqueue: enqueue,
        suspenseDepth: 0,
      }
      return withStoreContext(() =>
        _contextAls.run([], () =>
          _streamCtxAls
            .run(ctx, async () => {
              await streamNode(root, enqueue)
              // Drain all pending Suspense resolutions (may spawn nested ones)
              while (ctx.pending.length > 0) {
                await Promise.all(ctx.pending.splice(0))
              }
              controller.close()
            })
            .catch((err) => controller.error(err)),
        ),
      )
    },
  })
}

// ─── Streaming renderer ───────────────────────────────────────────────────────

async function streamVNode(vnode: VNode, enqueue: (s: string) => void): Promise<void> {
  if (vnode.type === Fragment) {
    for (const child of vnode.children) await streamNode(child, enqueue)
    return
  }

  if (vnode.type === (ForSymbol as unknown as string)) {
    const { each, children, by } = vnode.props as unknown as ForProps<unknown>
    enqueue('<!--pyreon-for-->')
    for (const item of each()) {
      const key = by(item)
      if (__DEV__) _countSink.__pyreon_count__?.('runtime-server.for.keyMarker')
      enqueue(`<!--k:${safeKeyForMarker(key)}-->`)
      await streamNode(children(item) as VNodeChild, enqueue)
    }
    enqueue('<!--/pyreon-for-->')
    return
  }

  if (typeof vnode.type === 'function') {
    await streamComponentNode(vnode, enqueue)
    return
  }

  await streamElementNode(vnode, enqueue)
}

async function streamComponentNode(vnode: VNode, enqueue: (s: string) => void): Promise<void> {
  if (vnode.type === Suspense) {
    await streamSuspenseBoundary(vnode, enqueue)
    return
  }
  if (__DEV__) _countSink.__pyreon_count__?.('runtime-server.component')
  try {
    const { vnode: output } = runWithHooks(vnode.type as ComponentFn, mergeChildrenIntoProps(vnode))
    const resolved = output instanceof Promise ? await output : output
    if (resolved !== null) await streamNode(resolved, enqueue)
  } catch (err) {
    if (__DEV__) {
      const name = (vnode.type as ComponentFn).name || 'Anonymous'
      console.error(`[Pyreon SSR] Error rendering <${name}>:`, err)
    }
    // Inside a Suspense child resolution, re-throw so the boundary can catch and
    // suppress the swap (fallback stays visible). Outside Suspense, swallow the
    // error and emit a marker so the stream can continue.
    const ctx = _streamCtxAls.getStore()
    if (ctx && ctx.suspenseDepth > 0) throw err
    enqueue('<!--pyreon-error-->')
  }
}

async function streamElementNode(vnode: VNode, enqueue: (s: string) => void): Promise<void> {
  const tag = vnode.type as string
  warnIfUnsafeTag(tag)
  let open = `<${tag}`
  const props = vnode.props as Record<string, unknown>
  for (const key in props) {
    const attr = renderProp(key, props[key])
    if (attr) open += ` ${attr}`
  }
  if (isVoidElement(tag)) {
    enqueue(`${open} />`)
    return
  }
  enqueue(`${open}>`)
  // `dangerouslySetInnerHTML` and `innerHTML` both become inner content
  // of the element (NOT attributes). Skipped in `renderPropSkipped` to
  // keep them out of the open-tag attribute list. Function values —
  // emitted by the compiler for signal-derived prop expressions — are
  // called once at render time (SSR is one-shot; any reactivity happens
  // post-hydration on the client).
  const dangerous = props.dangerouslySetInnerHTML as { __html: string } | (() => { __html: string }) | undefined
  const innerHtml = props.innerHTML as string | (() => string) | undefined
  const dangerousHtml =
    typeof dangerous === 'function' ? (dangerous as () => { __html: string })()?.__html : dangerous?.__html
  const plainInnerHtml =
    typeof innerHtml === 'function' ? (innerHtml as () => string)() : innerHtml
  if (dangerousHtml) {
    enqueue(dangerousHtml)
  } else if (plainInnerHtml != null && plainInnerHtml !== '') {
    enqueue(String(plainInnerHtml))
  } else {
    for (const child of vnode.children) await streamNode(child, enqueue)
  }
  enqueue(`</${tag}>`)
}

async function streamNode(
  node: VNodeChild | null | (() => VNodeChild),
  enqueue: (s: string) => void,
): Promise<void> {
  if (typeof node === 'function') {
    return streamNode((node as () => VNodeChild)(), enqueue)
  }
  if (node == null || node === false) return
  if (typeof node === 'string') {
    enqueue(escapeHtml(node))
    return
  }
  if (typeof node === 'number' || typeof node === 'boolean') {
    enqueue(String(node))
    return
  }
  if (Array.isArray(node)) {
    for (const child of node) await streamNode(child, enqueue)
    return
  }

  await streamVNode(node as VNode, enqueue)
}

// Inline swap helper emitted once per stream, before the first <template>
const SUSPENSE_SWAP_FN =
  '<script>function __NS(s,t){var e=document.getElementById(s),l=document.getElementById(t);' +
  'if(e&&l){e.replaceWith(l.content.cloneNode(!0));l.remove()}}</script>'

/**
 * Stream a Suspense boundary: emit fallback immediately, then resolve children
 * asynchronously and emit them as a `<template>` + client-side swap.
 *
 * The actual children HTML is buffered until fully resolved, then emitted to the
 * main stream enqueue so it always arrives after the fallback placeholder.
 */
async function streamSuspenseBoundary(vnode: VNode, enqueue: (s: string) => void): Promise<void> {
  if (__DEV__) _countSink.__pyreon_count__?.('runtime-server.suspense.boundary')
  const ctx = _streamCtxAls.getStore()
  const { fallback, children } = vnode.props as { fallback: VNodeChild; children?: VNodeChild }

  // No streaming context (e.g. called from renderToString) — render children inline
  if (!ctx) {
    const { vnode: output } = runWithHooks(Suspense as ComponentFn, vnode.props)
    if (output !== null) await streamNode(output, enqueue)
    return
  }

  const id = ctx.nextId()
  const { mainEnqueue } = ctx

  // Emit the swap helper function once (before first use)
  if (id === 0) mainEnqueue(SUSPENSE_SWAP_FN)

  // Stream the fallback synchronously (no await on children)
  mainEnqueue(`<div id="pyreon-s-${id}">`)
  await streamNode(fallback ?? null, enqueue)
  mainEnqueue('</div>')

  // Capture the context store for the async resolution so it inherits context
  const ctxStore = _contextAls.getStore() ?? []

  // Queue async resolution — runs in parallel, emits to main stream when done.
  // Errors are caught per-boundary so one failing Suspense doesn't abort the stream.
  // Timeout prevents hung async children from keeping the stream open forever.
  const SUSPENSE_TIMEOUT_MS = 30_000

  ctx.pending.push(
    _contextAls.run(ctxStore, async () => {
      try {
        ctx.suspenseDepth++
        const buf: string[] = []

        // Race the async children against a timeout
        const result = await Promise.race([
          streamNode(children ?? null, (s) => buf.push(s)).then(() => 'resolved' as const),
          new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), SUSPENSE_TIMEOUT_MS)),
        ])

        if (result === 'timeout') {
          if (__DEV__) {
            _countSink.__pyreon_count__?.('runtime-server.suspense.fallback')
            console.warn(
              `[Pyreon SSR] Suspense boundary timed out after ${SUSPENSE_TIMEOUT_MS}ms — fallback will remain.`,
            )
          }
          // Fallback stays visible — no swap
          return
        }

        // Escape </template> in buffered content to prevent early close + XSS
        const content = buf.join('').replace(/<\/template/gi, '<\\/template')
        mainEnqueue(`<template id="pyreon-t-${id}">${content}</template>`)
        mainEnqueue(`<script>__NS("pyreon-s-${id}","pyreon-t-${id}")</script>`)
      } catch (err) {
        if (__DEV__) {
          console.error(
            `[Pyreon SSR] Suspense boundary caught an error — fallback will remain:`,
            err,
          )
        }
        // Fallback stays visible — no swap script emitted
      } finally {
        ctx.suspenseDepth--
      }
    }),
  )
}

// ─── Core renderer ───────────────────────────────────────────────────────────

async function renderNode(node: VNodeChild | (() => VNodeChild)): Promise<string> {
  // Reactive accessor — call it synchronously (snapshot)
  if (typeof node === 'function') {
    return renderNode((node as () => VNodeChild)())
  }

  if (node == null || node === false) return ''

  if (typeof node === 'string') return escapeHtml(node)
  if (typeof node === 'number' || typeof node === 'boolean') return String(node)

  if (Array.isArray(node)) {
    let html = ''
    for (const child of node) html += await renderNode(child)
    return html
  }

  const vnode = node as VNode

  if (vnode.type === Fragment) {
    return renderChildren(vnode.children)
  }

  if (vnode.type === (ForSymbol as unknown as string)) {
    const { each, children, by } = vnode.props as unknown as ForProps<unknown>
    let forHtml = '<!--pyreon-for-->'
    for (const item of each()) {
      const key = by(item)
      if (__DEV__) _countSink.__pyreon_count__?.('runtime-server.for.keyMarker')
      forHtml += `<!--k:${safeKeyForMarker(key)}-->`
      forHtml += await renderNode(children(item) as VNodeChild)
    }
    forHtml += '<!--/pyreon-for-->'
    return forHtml
  }

  if (typeof vnode.type === 'function') {
    return renderComponent(vnode as VNode & { type: ComponentFn })
  }

  return renderElement(vnode)
}

async function renderChildren(children: VNodeChild[]): Promise<string> {
  let html = ''
  for (const child of children) html += await renderNode(child)
  return html
}

async function renderComponent(vnode: VNode & { type: ComponentFn }): Promise<string> {
  if (__DEV__) _countSink.__pyreon_count__?.('runtime-server.component')
  const { vnode: output } = runWithHooks(vnode.type, mergeChildrenIntoProps(vnode))

  // Async component function (async function Component()) — await the promise
  if (output instanceof Promise) {
    const resolved = await output
    if (resolved === null) return ''
    return renderNode(resolved)
  }

  if (output === null) return ''
  return renderNode(output)
}

async function renderElement(vnode: VNode): Promise<string> {
  const tag = vnode.type as string
  warnIfUnsafeTag(tag)
  let html = `<${tag}`

  const props = vnode.props as Record<string, unknown>
  for (const key in props) {
    const attr = renderProp(key, props[key])
    if (attr) html += ` ${attr}`
  }

  if (isVoidElement(tag)) {
    html += ' />'
    return html
  }

  html += '>'

  // `dangerouslySetInnerHTML` and `innerHTML` become inner content of the
  // element (NOT attributes — skipped in `renderPropSkipped`). Function
  // values — emitted by the compiler for signal-derived prop expressions —
  // are called once at render time (SSR is one-shot; reactivity happens
  // post-hydration on the client). Kept in sync with `streamElementNode`.
  const dangerous = props.dangerouslySetInnerHTML as
    | { __html: string }
    | (() => { __html: string })
    | undefined
  const innerHtml = props.innerHTML as string | (() => string) | undefined
  const dangerousHtml =
    typeof dangerous === 'function'
      ? (dangerous as () => { __html: string })()?.__html
      : dangerous?.__html
  const plainInnerHtml =
    typeof innerHtml === 'function' ? (innerHtml as () => string)() : innerHtml
  if (dangerousHtml) {
    html += dangerousHtml
  } else if (plainInnerHtml != null && plainInnerHtml !== '') {
    html += String(plainInnerHtml)
  } else {
    for (const child of vnode.children) {
      html += await renderNode(child)
    }
  }

  html += `</${tag}>`
  return html
}

const SSR_URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'poster', 'cite', 'data'])
const SSR_UNSAFE_URL_RE = /^\s*(?:javascript|data):/i

function renderPropSkipped(key: string): boolean {
  // `innerHTML` and `dangerouslySetInnerHTML` are NOT attributes — they
  // get written as inner content in `streamElementNode`. Without this
  // skip, `innerHTML` would be emitted as a literal HTML attribute
  // (`<span innerHTML="&lt;svg&gt;…">`) and the client hydration would
  // fix it up — wasted bytes, hydration mismatch, and (with the recent
  // client-side `innerHTML` bug) literal closure text visible before
  // hydration completed.
  if (key === 'key' || key === 'ref') return true
  if (key === 'innerHTML' || key === 'dangerouslySetInnerHTML') return true
  if (/^on[A-Z]/.test(key)) return true
  return false
}

function renderPropValue(key: string, value: unknown): string | null {
  if (value === null || value === undefined || value === false) return null
  if (value === true) return escapeHtml(toAttrName(key))

  if (key === 'class') {
    const cls = cx(value as ClassValue)
    return cls ? `class="${escapeHtml(cls)}"` : null
  }

  if (key === 'style') {
    const style = normalizeStyle(value)
    return style ? `style="${escapeHtml(style)}"` : null
  }

  return `${escapeHtml(toAttrName(key))}="${escapeHtml(String(value))}"`
}

function renderProp(key: string, value: unknown): string | null {
  if (renderPropSkipped(key)) return null

  if (typeof value === 'function') {
    return renderProp(key, (value as () => unknown)())
  }

  if (SSR_URL_ATTRS.has(key) && typeof value === 'string' && SSR_UNSAFE_URL_RE.test(value)) {
    return null
  }

  return renderPropValue(key, value)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

function isVoidElement(tag: string): boolean {
  return VOID_ELEMENTS.has(tag.toLowerCase())
}

/** camelCase prop → kebab-case HTML attribute (e.g. className → class, htmlFor → for) */
function toAttrName(key: string): string {
  if (key === 'className') return 'class'
  if (key === 'htmlFor') return 'for'
  return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
}

function isStyleObject(value: unknown): value is Record<string, unknown> {
  if (!value) return false
  return typeof value === 'object'
}

function normalizeStyle(value: unknown): string {
  if (typeof value === 'string') return value
  if (isStyleObject(value)) {
    const proto = Object.getPrototypeOf(value)
    if (proto === Object.prototype || proto === null) {
      return Object.entries(value)
        .map(([k, v]) => `${toKebab(k)}: ${normalizeStyleValue(k, v)}`)
        .join('; ')
    }
  }
  return ''
}

function toKebab(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
}

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * Encode a For-list key so it's safe to inline inside an HTML comment
 * marker `<!--k:KEY-->`. If a user-supplied key contains `-->` the naive
 * form breaks out of the comment and may inject markup. Per-byte URL
 * encoding with an extra `-` substitution makes `-->` impossible in the
 * output: `%2D%2D>` no longer terminates the comment. Client-side
 * hydration does not read the marker body today, so any reversible-or-
 * irreversible encoding works; this one is predictable enough for a
 * future consumer to decode if needed.
 */
function safeKeyForMarker(key: unknown): string {
  return encodeURIComponent(String(key)).replace(/-/g, '%2D')
}

/**
 * Inverse of `safeKeyForMarker` — decode a marker-safe key back to the
 * original string. Not used by runtime today (hydration does not read
 * per-item `<!--k:KEY-->` markers) but shipped alongside the encoder so
 * future hydration or devtools consumers decode symmetrically without
 * having to re-derive the encoding from source.
 */
export function decodeKeyFromMarker(encoded: string): string {
  return decodeURIComponent(encoded.replace(/%2D/gi, '-'))
}

// Detect tag names that would break out of the `<TAG>` or `</TAG>` form
// and inject HTML. If user data ever feeds `h(userTag, ...)` the attack
// `userTag = 'div><script>alert(1)</script><div'` yields executable
// markup. Framework doesn't HTML-escape tag names (React/Vue/Solid
// match) — responsibility is on the caller — but a dev-mode warning
// catches the mistake before it reaches prod. Safe tag pattern covers
// HTML element names and custom elements (letter start, then
// alphanumerics + hyphens).
const SAFE_TAG_RE = /^[a-zA-Z][a-zA-Z0-9-]*$/
function warnIfUnsafeTag(tag: string): void {
  if (!__DEV__) return
  if (SAFE_TAG_RE.test(tag)) return
  // oxlint-disable-next-line no-console
  console.warn(
    `[Pyreon SSR] Tag name "${tag}" contains characters that could break HTML structure. ` +
      `Tag names must match /^[a-zA-Z][a-zA-Z0-9-]*$/. ` +
      `If user-supplied data drives a tag name, validate it against an allowlist before passing to h().`,
  )
}

// Fast test — most strings in SSR have no special chars (tag names, class names, etc.)
const NEEDS_ESCAPE_RE = /[&<>"']/

function escapeHtml(str: string): string {
  if (!NEEDS_ESCAPE_RE.test(str)) return str
  if (__DEV__) _countSink.__pyreon_count__?.('runtime-server.escape')
  return str.replace(/[&<>"']/g, (c) => ESCAPE_MAP[c] ?? c)
}

/**
 * Merge vnode.children into props.children for component rendering.
 * Matches the behavior of mount.ts and hydrate.ts so components can
 * access children passed via h(Comp, props, child1, child2).
 */
function mergeChildrenIntoProps(vnode: VNode): Record<string, unknown> {
  if (
    vnode.children.length > 0 &&
    (vnode.props as Record<string, unknown>).children === undefined
  ) {
    return {
      ...vnode.props,
      children: vnode.children.length === 1 ? vnode.children[0] : vnode.children,
    }
  }
  return vnode.props as Record<string, unknown>
}
