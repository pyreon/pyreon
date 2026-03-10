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

import { AsyncLocalStorage } from "node:async_hooks"
import { Fragment, ForSymbol, Suspense, runWithHooks, setContextStackProvider } from "@pyreon/core"
import type { ComponentFn, ForProps, VNode, VNodeChild } from "@pyreon/core"

// ─── Streaming Suspense context ───────────────────────────────────────────────
// Tracks in-flight async Suspense boundary resolutions within a single stream.

interface StreamCtx {
  pending: Array<Promise<void>>
  nextId: () => number
  mainEnqueue: (s: string) => void
}

const _streamCtxAls = new AsyncLocalStorage<StreamCtx>()

// ─── Concurrent SSR context isolation ────────────────────────────────────────
// Each renderToString call runs in its own ALS store (a fresh empty stack[]).
// Concurrent requests never share context frames.

const _contextAls = new AsyncLocalStorage<Map<symbol, unknown>[]>()
const _fallbackStack: Map<symbol, unknown>[] = []

setContextStackProvider(() => _contextAls.getStore() ?? _fallbackStack)

// ─── Store isolation (optional) ───────────────────────────────────────────────
// A second ALS isolates @pyreon/store registries between concurrent requests.
// Activated only when the user calls configureStoreIsolation().

const _storeAls = new AsyncLocalStorage<Map<string, unknown>>()
let _storeIsolationActive = false

/**
 * Wire up per-request @pyreon/store isolation.
 * Call once at server startup, passing `setStoreRegistryProvider` from @pyreon/store.
 *
 * @example
 * import { setStoreRegistryProvider } from "@pyreon/store"
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
  if (root === null) return ""
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
  return new ReadableStream<string>({
    start(controller) {
      const enqueue = (chunk: string) => controller.enqueue(chunk)
      let bid = 0
      const ctx: StreamCtx = {
        pending: [],
        nextId: () => bid++,
        mainEnqueue: enqueue,
      }
      return withStoreContext(() =>
        _contextAls.run([], () =>
          _streamCtxAls.run(ctx, async () => {
            await streamNode(root, enqueue)
            // Drain all pending Suspense resolutions (may spawn nested ones)
            while (ctx.pending.length > 0) {
              await Promise.all(ctx.pending.splice(0))
            }
            controller.close()
          }).catch((err) => controller.error(err)),
        ),
      )
    },
  })
}

// ─── Streaming renderer ───────────────────────────────────────────────────────

async function streamNode(node: VNodeChild | null | (() => VNodeChild), enqueue: (s: string) => void): Promise<void> {
  if (typeof node === "function") {
    return streamNode((node as () => VNodeChild)(), enqueue)
  }
  if (node == null || node === false) return
  if (typeof node === "string") { enqueue(escapeHtml(node)); return }
  if (typeof node === "number" || typeof node === "boolean") { enqueue(String(node)); return }
  if (Array.isArray(node)) {
    for (const child of node) await streamNode(child, enqueue)
    return
  }

  const vnode = node as VNode

  if (vnode.type === Fragment) {
    for (const child of vnode.children) await streamNode(child, enqueue)
    return
  }

  if (vnode.type === (ForSymbol as unknown as string)) {
    const { each, children } = vnode.props as unknown as ForProps<unknown>
    enqueue("<!--pyreon-for-->")
    for (const item of each()) await streamNode(children(item) as VNodeChild, enqueue)
    enqueue("<!--/pyreon-for-->")
    return
  }

  if (typeof vnode.type === "function") {
    // Suspense boundary — stream fallback immediately, resolve children async
    if (vnode.type === Suspense) {
      await streamSuspenseBoundary(vnode, enqueue)
      return
    }
    const { vnode: output } = runWithHooks(vnode.type as ComponentFn, mergeChildrenIntoProps(vnode))
    const resolved = output instanceof Promise ? await output : output
    if (resolved !== null) await streamNode(resolved, enqueue)
    return
  }

  // HTML element — flush opening tag immediately, then stream children, then close
  const tag = vnode.type as string
  let open = `<${tag}`
  for (const [key, value] of Object.entries(vnode.props)) {
    const attr = renderProp(key, value)
    if (attr) open += ` ${attr}`
  }
  if (isVoidElement(tag)) { enqueue(`${open} />`); return }
  enqueue(`${open}>`)
  for (const child of vnode.children) await streamNode(child, enqueue)
  enqueue(`</${tag}>`)
}

// Inline swap helper emitted once per stream, before the first <template>
const SUSPENSE_SWAP_FN =
  "<script>function __NS(s,t){var e=document.getElementById(s),l=document.getElementById(t);" +
  "if(e&&l){e.replaceWith(l.content.cloneNode(!0));l.remove()}}</script>"

/**
 * Stream a Suspense boundary: emit fallback immediately, then resolve children
 * asynchronously and emit them as a `<template>` + client-side swap.
 *
 * The actual children HTML is buffered until fully resolved, then emitted to the
 * main stream enqueue so it always arrives after the fallback placeholder.
 */
async function streamSuspenseBoundary(vnode: VNode, enqueue: (s: string) => void): Promise<void> {
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
  mainEnqueue("</div>")

  // Capture the context store for the async resolution so it inherits context
  const ctxStore = _contextAls.getStore() ?? []

  // Queue async resolution — runs in parallel, emits to main stream when done
  ctx.pending.push(
    _contextAls.run(ctxStore, async () => {
      const buf: string[] = []
      await streamNode(children ?? null, (s) => buf.push(s))
      mainEnqueue(`<template id="pyreon-t-${id}">${buf.join("")}</template>`)
      mainEnqueue(`<script>__NS("pyreon-s-${id}","pyreon-t-${id}")</script>`)
    }),
  )
}

// ─── Core renderer ───────────────────────────────────────────────────────────

async function renderNode(node: VNodeChild | (() => VNodeChild)): Promise<string> {
  // Reactive accessor — call it synchronously (snapshot)
  if (typeof node === "function") {
    return renderNode((node as () => VNodeChild)())
  }

  if (node == null || node === false) return ""

  if (typeof node === "string") return escapeHtml(node)
  if (typeof node === "number" || typeof node === "boolean") return String(node)

  if (Array.isArray(node)) {
    const parts = await Promise.all(node.map((n) => renderNode(n)))
    return parts.join("")
  }

  const vnode = node as VNode

  if (vnode.type === Fragment) {
    return renderChildren(vnode.children)
  }

  if (vnode.type === (ForSymbol as unknown as string)) {
    const { each, children } = vnode.props as unknown as ForProps<unknown>
    const parts = await Promise.all(each().map((item) => renderNode(children(item) as VNodeChild)))
    // Hydration markers so the client can claim existing For-rendered children
    return `<!--pyreon-for-->${parts.join("")}<!--/pyreon-for-->`
  }

  if (typeof vnode.type === "function") {
    return renderComponent(vnode as VNode & { type: ComponentFn })
  }

  return renderElement(vnode)
}

async function renderChildren(children: VNodeChild[]): Promise<string> {
  const parts = await Promise.all(children.map((c) => renderNode(c)))
  return parts.join("")
}

async function renderComponent(vnode: VNode & { type: ComponentFn }): Promise<string> {
  const { vnode: output } = runWithHooks(vnode.type, mergeChildrenIntoProps(vnode))

  // Async component function (async function Component()) — await the promise
  if (output instanceof Promise) {
    const resolved = await output
    if (resolved === null) return ""
    return renderNode(resolved)
  }

  if (output === null) return ""
  return renderNode(output)
}

async function renderElement(vnode: VNode): Promise<string> {
  const tag = vnode.type as string
  let html = `<${tag}`

  for (const [key, value] of Object.entries(vnode.props)) {
    const attr = renderProp(key, value)
    if (attr) html += ` ${attr}`
  }

  if (isVoidElement(tag)) {
    html += " />"
    return html
  }

  html += ">"

  for (const child of vnode.children) {
    html += await renderNode(child)
  }

  html += `</${tag}>`
  return html
}

const SSR_URL_ATTRS = new Set(["href", "src", "action", "formaction", "poster", "cite", "data"])
const SSR_UNSAFE_URL_RE = /^\s*(?:javascript|data):/i

function renderProp(key: string, value: unknown): string | null {
  if (key === "key" || key === "ref" || key === "n-show") return null

  // Custom directives — not emitted as HTML attributes
  if (key.startsWith("n-")) return null

  // Event handlers — not emitted in SSR HTML
  if (/^on[A-Z]/.test(key)) return null

  // Reactive getter — snapshot it
  if (typeof value === "function") {
    return renderProp(key, (value as () => unknown)())
  }

  // Block javascript:/data: URI injection in URL-bearing attributes.
  if (SSR_URL_ATTRS.has(key) && typeof value === "string" && SSR_UNSAFE_URL_RE.test(value)) {
    return null
  }

  if (value === null || value === undefined || value === false) return null
  if (value === true) return escapeHtml(toAttrName(key))

  if (key === "class") {
    const cls = normalizeClass(value)
    return cls ? `class="${escapeHtml(cls)}"` : null
  }

  if (key === "style") {
    const style = normalizeStyle(value)
    return style ? `style="${escapeHtml(style)}"` : null
  }

  return `${escapeHtml(toAttrName(key))}="${escapeHtml(String(value))}"`
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
])

function isVoidElement(tag: string): boolean {
  return VOID_ELEMENTS.has(tag.toLowerCase())
}

/** camelCase prop → kebab-case HTML attribute (e.g. className → class, htmlFor → for) */
function toAttrName(key: string): string {
  if (key === "className") return "class"
  if (key === "htmlFor") return "for"
  return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
}

function normalizeClass(value: unknown): string {
  if (typeof value === "string") return value
  if (Array.isArray(value)) return value.filter(Boolean).join(" ")
  if (typeof value === "object" && value !== null) {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(" ")
  }
  return ""
}

function normalizeStyle(value: unknown): string {
  if (typeof value === "string") return value
  if (typeof value === "object" && value !== null) {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${toKebab(k)}: ${v}`)
      .join("; ")
  }
  return ""
}

function toKebab(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
}

const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

function escapeHtml(str: string): string {
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
