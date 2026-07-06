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

import { name as __pkgName, version as __pkgVersion } from '../package.json' with { type: 'json' }
import { registerSingleton } from '@pyreon/reactivity'

// Singleton sentinel — fail-loud detection of duplicate @pyreon/runtime-server
// instances in the same heap. See @pyreon/reactivity/singleton-sentinel for
// full rationale. Hardcoded version is acceptable here — it's a diagnostic
// aid, not a load-bearing identity check.
registerSingleton(__pkgName, __pkgVersion, import.meta.url)

import { AsyncLocalStorage } from 'node:async_hooks'
import type { ClassValue, ComponentFn, ForProps, VNode, VNodeChild } from '@pyreon/core'
import {
  cx,
  ForSymbol,
  Fragment,
  getContextStackLength,
  isSafeImageDataUri,
  makeReactiveProps,
  normalizeStyleValue,
  popContext,
  runWithHooks,
  Suspense,
  setContextStackProvider,
  UNSAFE_URL_RE,
  URL_ATTRS,
} from '@pyreon/core'

// Dev-mode perf counter sink. Zero coupling to @pyreon/perf-harness — we just
// call the global if it's installed. Dev gates are the BARE INLINE
// `process.env.NODE_ENV !== 'production'` at every site — never a local
// `__DEV__` const alias and never a `typeof process` prefix: the alias/prefix
// make the expression non-constant under a bundler's define, so edge/workerd
// SSR bundles (which minify this file) shipped every counter + dev warning.
// Bare inline folds (process is always real in Node/Bun where this runs, and
// nodejs_compat provides it on workerd). See anti-patterns: __DEV__ alias.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

// ─── Streaming Suspense context ───────────────────────────────────────────────
// Tracks in-flight async Suspense boundary resolutions within a single stream.

interface StreamCtx {
  pending: Promise<void>[]
  nextId: () => number
  mainEnqueue: (s: string) => void
  /** Depth counter — non-zero when rendering inside a Suspense child resolution. */
  suspenseDepth: number
  /**
   * Abort signal fired when EITHER the upstream caller's signal aborts
   * OR the stream consumer (`ReadableStream.cancel()`) closes. Boundary
   * resolvers check this before enqueuing post-resolve HTML so they
   * stop streaming once the client has hung up.
   */
  signal?: AbortSignal
  /**
   * Per-boundary Suspense timeout (ms). When an async Suspense child
   * doesn't resolve within this window, the fallback stays visible and
   * the resolved content is dropped. Set to `Infinity` to disable the
   * timeout entirely (apps that prefer waiting indefinitely over showing
   * the fallback). Defaults to 30_000 (30s) — matches the pre-config
   * hard-coded value, so unset is byte-identical to prior behavior.
   */
  suspenseTimeoutMs: number
}

const _streamCtxAls = new AsyncLocalStorage<StreamCtx>()

// ─── Concurrent SSR context isolation ────────────────────────────────────────
// Each renderToString call runs in its own ALS store (a fresh empty stack[]).
// Concurrent requests never share context frames.

const _contextAls = new AsyncLocalStorage<Map<symbol, unknown>[]>()
const _fallbackStack: Map<symbol, unknown>[] = []

// `?? _fallbackStack` only fires when the provider is called with no active ALS
// run (a bare `provide()` at module scope, outside any render) — defensive; all
// render paths run inside `_contextAls.run(...)`.
/* v8 ignore next */
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

// ─── <select value> SSR support (PZ-09) ─────────────────────────────────────
// <select> has NO `value` CONTENT attribute — serializing `value="…"` emits a
// DEAD attribute the parser ignores, so SSR'd pages shipped with the FIRST
// option selected regardless of the value prop. Instead the selection intent
// is carried the way HTML expresses it: the matching <option> gets a
// `selected` attribute (renderProp drops the dead attr from the <select> open
// tag). The nearest-enclosing-select frame flows to option rendering via
// AsyncLocalStorage — the context follows the async continuation graph, so
// concurrent renders / streams can never observe each other's frame (no
// shared mutable stack, no cleanup contract — the scope ends with the run).
// Hydration parity: the client applies `select.value` AFTER children mount
// (runtime-dom PZ-09 fix), selecting the same option the SSR markup marked.

interface SelectValueFrame {
  /** String-coerced select value — HTMLSelectElement.value setter semantics. */
  value: string
  /** The `.value` setter selects only the FIRST matching option. */
  matched: boolean
}

const _selectValueAls = new AsyncLocalStorage<SelectValueFrame>()

/**
 * Build the frame for a `<select>` about to render its children. `null` when
 * the select carries no usable value: absent, null/undefined (no selection
 * intent — an option's own `selected` attribute stays authoritative, matching
 * the client where applyStaticProp's null branch never assigns the property),
 * or boolean (the client's boolean branch is presence-attr semantics, never a
 * property set). Function values (compiler-emitted signal thunks) are called
 * once — SSR is one-shot. Array values (a `multiple` idiom Pyreon does NOT
 * support client-side either — `select.value = arr` coerces to a string)
 * String()-coerce the same way the client property assignment would.
 */
function makeSelectFrame(props: Record<string, unknown>): SelectValueFrame | null {
  if (!('value' in props)) return null
  let v: unknown = props.value
  if (typeof v === 'function') v = (v as () => unknown)()
  if (v == null || typeof v === 'boolean') return null
  return { value: String(v), matched: false }
}

/**
 * ` selected` when this `<option>` matches the nearest enclosing `<select>`'s
 * value prop; `''` otherwise. The option's comparison value comes from its
 * `value` prop (function values called once), falling back to the option's
 * TEXT per HTML semantics (HTMLOptionElement.value → `.text`: descendant
 * text, ASCII-whitespace stripped and collapsed); a non-text child makes the
 * fallback unknowable → no match. Options that declare their OWN `selected`
 * prop are skipped (author-controlled selection — note the CLIENT `.value`
 * setter would deselect them post-hydration; passing both `value` on the
 * select and `selected` on a different option is contradictory input).
 * First match only — mirrors the `.value` setter.
 */
function optionSelectedAttr(props: Record<string, unknown>, children: VNodeChild[]): string {
  const frame = _selectValueAls.getStore()
  if (!frame || frame.matched) return ''
  if ('selected' in props) return ''
  let v: unknown = 'value' in props ? props.value : undefined
  if (typeof v === 'function') v = (v as () => unknown)()
  let optValue: string
  if (v == null || typeof v === 'boolean') {
    const acc = { text: '' }
    if (!collectOptionText(children, acc)) return ''
    optValue = acc.text.replace(/\s+/g, ' ').trim()
  } else {
    optValue = String(v)
  }
  if (optValue !== frame.value) return ''
  frame.matched = true
  return ' selected'
}

/**
 * Accumulate an option's descendant text; `false` when a non-text child
 * (component, element, function) makes the fallback value unknowable.
 */
function collectOptionText(children: VNodeChild[], acc: { text: string }): boolean {
  for (const child of children) {
    if (child == null || typeof child === 'boolean') continue
    if (typeof child === 'string' || typeof child === 'number') {
      acc.text += String(child)
      continue
    }
    if (Array.isArray(child)) {
      if (!collectOptionText(child, acc)) return false
      continue
    }
    return false
  }
  return true
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Render a VNode tree to an HTML string. Supports async component functions. */
export async function renderToString(root: VNode | null): Promise<string> {
  if (root === null) return ''
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('runtime-server.render')
  // Inside an active request context (`runWithRequestContext`), INHERIT it —
  // request-level `provide()` frames (middleware locals via
  // `provideRequestLocals`, request-scoped DI) must be visible to the
  // rendered components. Pre-fix this always opened a FRESH `_contextAls`
  // run with an empty stack, so the nested ALS scope silently DISCARDED
  // every request-level provide — `useRequestLocals()` could never resolve
  // anything but the default inside a rendered component, even though the
  // handler dutifully called `provideRequestLocals(ctx.locals)` first.
  // Per-component trims restore the stack to each component's entry length,
  // so inherited request frames survive the render untouched.
  //
  // Bare calls (no surrounding request context) keep the fresh isolated
  // stack + store registry — unchanged behavior.
  if (_contextAls.getStore() !== undefined) return renderNode(root)
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
export interface RenderToStreamOptions {
  /**
   * AbortSignal to cancel in-flight Suspense work when the client
   * disconnects (browser back-button, navigation, fetch reader closes,
   * etc.). On abort, the stream's `cancel()` fires the signal —
   * pending Suspense boundaries are abandoned (the fallback HTML they
   * already wrote stays in the buffer that's now closed) and the
   * background async work they spawned is no longer awaited. The work
   * itself isn't forcibly killed (JS has no async cancellation
   * primitive at the language level), but the framework stops blocking
   * on it. Pass your own signal from upstream (e.g. a `Request.signal`)
   * to chain abort propagation.
   */
  signal?: AbortSignal
  /**
   * Per-boundary Suspense timeout in milliseconds. When an async
   * Suspense child doesn't resolve within this window, its fallback
   * stays visible (the resolved content is dropped — no `<template>`
   * + swap script is emitted) and a dev-mode warning fires. Defaults
   * to 30_000 (30s); unset behavior is byte-identical to the
   * pre-config implementation.
   *
   * Ops control: tighten this for tight-SLA deploys (5_000–10_000 is
   * typical for user-facing apps where a fallback is preferable to a
   * delayed full render). Loosen it (or pass `Infinity` to disable)
   * for renders that legitimately need long async work — exports,
   * reports, scheduled jobs, etc.
   *
   * Values ≤0 or `NaN` fall back to the default. `Infinity` is honored
   * verbatim — the timeout race is skipped entirely so a hung boundary
   * keeps the stream open until the AbortSignal fires or the consumer
   * cancels.
   */
  suspenseTimeoutMs?: number
}

export function renderToStream(
  root: VNode | null,
  options: RenderToStreamOptions = {},
): ReadableStream<string> {
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('runtime-server.stream')
  // Internal AbortController — fires when EITHER the caller's signal
  // aborts (upstream cancellation, e.g. `Request.signal`) OR the consumer
  // of the stream calls `.cancel()` (client closed the fetch reader).
  const ac = new AbortController()
  const signal = ac.signal
  if (options.signal) {
    if (options.signal.aborted) ac.abort(options.signal.reason)
    else
      options.signal.addEventListener('abort', () => ac.abort(options.signal!.reason), {
        once: true,
      })
  }
  // Resolve the Suspense timeout. Invalid input (≤0, NaN) falls back to
  // 30_000 — same as pre-config behavior. `Infinity` is preserved so the
  // boundary code can detect it and skip the race entirely.
  const userTimeout = options.suspenseTimeoutMs
  const suspenseTimeoutMs =
    userTimeout === Infinity
      ? Infinity
      : userTimeout !== undefined && Number.isFinite(userTimeout) && userTimeout > 0
        ? userTimeout
        : 30_000

  return new ReadableStream<string>({
    start(controller) {
      const enqueue = (chunk: string) => {
        if (signal.aborted) return // stop appending after abort
        controller.enqueue(chunk)
      }
      let bid = 0
      const ctx: StreamCtx = {
        pending: [],
        nextId: () => bid++,
        mainEnqueue: enqueue,
        suspenseDepth: 0,
        signal,
        suspenseTimeoutMs,
      }
      // One shared abort-promise — registered ONCE, resolved on signal
      // abort. Racing each pending batch against this lets the drain
      // loop exit promptly when the consumer hangs up, without accruing
      // one abort listener per loop iteration.
      const abortPromise: Promise<void> = signal.aborted
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            signal.addEventListener('abort', () => resolve(), { once: true })
          })

      // Same request-context inheritance as `renderToString` (see its
      // docstring): inside `runWithRequestContext`, reuse the active
      // request stack + store so request-level `provide()` frames
      // (middleware locals) reach streamed components; bare calls keep
      // the fresh isolated stack — unchanged behavior.
      const streamBody = () =>
        _streamCtxAls
          .run(ctx, async () => {
            await streamNode(root, enqueue)
            // Flush styler CSS rules collected during shell render.
            // The handler's shell `<head>` was pushed BEFORE the
            // appStream started, so any per-render styles cannot land
            // there — emit a `<style>` tag inline at the top of the
            // app body so shell content is correctly styled before
            // any Suspense boundary resolves. Per-boundary flushes
            // (see `streamSuspenseBoundary`) cover styles collected
            // during async boundary resolution. No-op when styler
            // isn't loaded.
            const stylerFlush = (globalThis as { __PYREON_STYLER_FLUSH__?: () => string })
              .__PYREON_STYLER_FLUSH__
            if (stylerFlush) {
              const newRules = stylerFlush()
              if (newRules) {
                const safeCss = newRules.replace(/<\/style/gi, '<\\/style')
                enqueue(`<style data-pyreon-stream="shell">${safeCss}</style>`)
              }
            }
            // Drain all pending Suspense resolutions (may spawn nested
            // ones). Each batch is RACED against the abort signal so a
            // mid-flight Suspense child doesn't keep us blocked after
            // the consumer hung up. Per-boundary work also checks
            // `ctx.signal.aborted` to skip its post-resolve enqueue.
            while (ctx.pending.length > 0) {
              if (signal.aborted) break
              const batch = Promise.all(ctx.pending.splice(0))
              await Promise.race([batch, abortPromise])
            }
            // ALWAYS close — gracefully on natural completion AND on
            // abort. (Pre-fix: `if (!aborted) close()` left the stream
            // open forever on cancel, hanging the reader.) Wrap in
            // try/catch because the stream may have already been
            // closed by `cancel()` upstream.
            try {
              controller.close()
            } catch {
              /* already closed (e.g. cancel raced ahead) */
            }
          })
          .catch((err) => {
            // Aborts are expected, not errors — close silently to mirror
            // a normal end-of-stream when the consumer hung up.
            if (signal.aborted) {
              try {
                controller.close()
              } catch {
                /* already closed */
              }
              return
            }
            controller.error(err)
          })
      return _contextAls.getStore() !== undefined
        ? streamBody()
        : withStoreContext(() => _contextAls.run([], streamBody))
    },
    cancel(reason) {
      // Consumer (browser fetch reader) closed the stream — propagate to
      // the internal controller so in-flight Suspense work stops being
      // awaited.
      ac.abort(reason)
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
    // Defensive: `each` is normally `_rp(() => arr)` (a function).
    // `makeReactiveProps` in `mergeChildrenIntoProps` invokes `_rp` getters
    // when the For COMPONENT runs, which flips `props.each` to the resolved
    // array on the re-emitted ForSymbol vnode. Accept both forms.
    const items = typeof each === 'function' ? each() : (each as Iterable<unknown>)
    for (const item of items) {
      const key = by(item)
      if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('runtime-server.for.keyMarker')
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
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('runtime-server.component')
  // Snapshot the context stack BEFORE the component renders so we can pop
  // any frames pushed via `provide()` after children stream. We do NOT run
  // user-registered unmount hooks during SSR — that would clear state still
  // needed by post-render extraction (e.g. `useHead` uses `onUnmount` to
  // remove its registered tags from the head store; running it during SSR
  // wipes the entries before `renderWithHead` reads them). See `renderComponent`
  // for the full architectural rationale.
  const stackLenBefore = getContextStackLength()
  try {
    const { vnode: output } = runWithHooks(vnode.type as ComponentFn, mergeChildrenIntoProps(vnode))
    // Async components: emit sentinel markers around the resolved output so
    // the client hydrate can find the SSR DOM range corresponding to the
    // (still-pending) Promise. Without these, hydrate has no way to know
    // where the async subtree begins / ends in the SSR DOM, so it can't
    // attach reactivity to it. `<!--$pas-->` (Pyreon async start) +
    // `<!--$pae-->` (end). Markers nest correctly with sibling/child async
    // components — the hydrate walker matches the nearest unclosed start.
    if (output instanceof Promise) {
      enqueue('<!--$pas-->')
      const resolved = await output
      if (resolved !== null) await streamNode(resolved, enqueue)
      enqueue('<!--$pae-->')
    } else if (output !== null) {
      await streamNode(output, enqueue)
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      const name = (vnode.type as ComponentFn).name || 'Anonymous'
      console.error(`[Pyreon SSR] Error rendering <${name}>:`, err)
    }
    // Inside a Suspense child resolution, re-throw so the boundary can catch and
    // suppress the swap (fallback stays visible). Outside Suspense, swallow the
    // error and emit a marker so the stream can continue.
    const ctx = _streamCtxAls.getStore()
    if (ctx && ctx.suspenseDepth > 0) throw err
    enqueue('<!--pyreon-error-->')
  } finally {
    trimContextStack(stackLenBefore)
  }
}

async function streamElementNode(vnode: VNode, enqueue: (s: string) => void): Promise<void> {
  const tag = vnode.type as string
  warnIfUnsafeTag(tag)
  let open = `<${tag}`
  const props = vnode.props as Record<string, unknown>
  for (const key in props) {
    const attr = renderProp(tag, key, props[key])
    if (attr) open += ` ${attr}`
  }
  // `<option>` inside a `<select value>` frame — see renderElement (PZ-09).
  if (tag === 'option') open += optionSelectedAttr(props, vnode.children)
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
  const dangerous = props.dangerouslySetInnerHTML as
    | { __html: string }
    | (() => { __html: string })
    | undefined
  const innerHtml = props.innerHTML as string | (() => string) | undefined
  const dangerousHtml =
    typeof dangerous === 'function'
      ? (dangerous as () => { __html: string })()?.__html
      : dangerous?.__html
  const plainInnerHtml = typeof innerHtml === 'function' ? (innerHtml as () => string)() : innerHtml
  if (dangerousHtml) {
    enqueue(dangerousHtml)
  } else if (plainInnerHtml != null && plainInnerHtml !== '') {
    enqueue(String(plainInnerHtml))
  } else {
    // `<select value>` frame — ALS scope, same as renderElement (PZ-09).
    // Load-bearing for streams: chunks of CONCURRENT streams interleave at
    // every await, so a module-level stack would cross-contaminate; the
    // ALS context sticks to this stream's continuation graph.
    const frame = tag === 'select' ? makeSelectFrame(props) : null
    if (frame) {
      await _selectValueAls.run(frame, async () => {
        for (const child of vnode.children) await streamNode(child, enqueue)
      })
    } else {
      for (const child of vnode.children) await streamNode(child, enqueue)
    }
  }
  enqueue(`</${tag}>`)
}

async function streamNode(
  node: VNodeChild | null | (() => VNodeChild),
  enqueue: (s: string) => void,
): Promise<void> {
  if (typeof node === 'function') {
    // Range markers around accessor output — see renderNode's fn arm.
    enqueue('<!--$-->')
    await streamNode((node as () => VNodeChild)(), enqueue)
    enqueue('<!--/$-->')
    return
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
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('runtime-server.suspense.boundary')
  const ctx = _streamCtxAls.getStore()
  const { fallback, children } = vnode.props as { fallback: VNodeChild; children?: VNodeChild }

  // Defensive: the streaming pipeline only enters this function via
  // `_streamCtxAls.run(ctx, ...)` (set up in `renderToStream`), so `ctx`
  // is always defined when `streamSuspenseBoundary` runs. Kept as a safety
  // net in case a future entry point bypasses the streaming context — the
  // block performs the same context-stack hygiene as `renderComponent` /
  // `streamComponentNode` so a Suspense `provide()` wouldn't leak into
  // siblings if it ever fires. Excluded from coverage because no public-API
  // path reaches it; including a unit test would either require exporting
  // `streamSuspenseBoundary` (leaks an internal) or stubbing the ALS (false
  // signal).
  /* c8 ignore start */
  if (!ctx) {
    const stackLenBefore = getContextStackLength()
    const { vnode: output } = runWithHooks(Suspense as ComponentFn, vnode.props)
    try {
      if (output !== null) await streamNode(output, enqueue)
    } finally {
      trimContextStack(stackLenBefore)
    }
    return
  }
  /* c8 ignore stop */

  const id = ctx.nextId()
  const { mainEnqueue } = ctx

  // Emit the swap helper function once (before first use)
  if (id === 0) mainEnqueue(SUSPENSE_SWAP_FN)

  // Stream the fallback synchronously (no await on children)
  mainEnqueue(`<div id="pyreon-s-${id}">`)
  await streamNode(fallback ?? null, enqueue)
  mainEnqueue('</div>')

  // Capture the context store for the async resolution so it inherits context.
  // `?? []` is defensive — the streaming pipeline always runs inside an active
  // `_contextAls` run, so `getStore()` is defined here.
  /* v8 ignore next */
  const ctxStore = _contextAls.getStore() ?? []

  // Queue async resolution — runs in parallel, emits to main stream when done.
  // Errors are caught per-boundary so one failing Suspense doesn't abort the stream.
  // Timeout prevents hung async children from keeping the stream open forever.
  // Configurable via `RenderToStreamOptions.suspenseTimeoutMs` (default 30_000;
  // `Infinity` disables the race so a hung boundary waits indefinitely until
  // the upstream AbortSignal or consumer cancel fires).
  const suspenseTimeoutMs = ctx.suspenseTimeoutMs

  ctx.pending.push(
    _contextAls.run(ctxStore, async () => {
      try {
        ctx.suspenseDepth++
        const buf: string[] = []

        // Race the async children against a timeout (skipped when the
        // user passed `Infinity` to opt out). Class I — capture the
        // timer id and clear on the success path; without this, every
        // successful Suspense boundary leaks a pending timer + resolve
        // callback until it fires. Caught by the `audit-leak-classes`
        // script's promise-race-no-clear detector.
        let result: 'resolved' | 'timeout'
        if (suspenseTimeoutMs === Infinity) {
          // No-timeout mode: just await children. AbortSignal still
          // applies via the outer drain-loop race in renderToStream.
          await streamNode(children ?? null, (s) => buf.push(s))
          result = 'resolved'
        } else {
          let timeoutId: ReturnType<typeof setTimeout> | undefined
          try {
            result = await Promise.race([
              streamNode(children ?? null, (s) => buf.push(s)).then(() => 'resolved' as const),
              new Promise<'timeout'>((resolve) => {
                timeoutId = setTimeout(() => resolve('timeout'), suspenseTimeoutMs)
              }),
            ])
          } finally {
            if (timeoutId !== undefined) clearTimeout(timeoutId)
          }
        }

        if (result === 'timeout') {
          if (process.env.NODE_ENV !== 'production') {
            _countSink.__pyreon_count__?.('runtime-server.suspense.fallback')
            console.warn(
              `[Pyreon SSR] Suspense boundary timed out after ${suspenseTimeoutMs}ms — fallback will remain.`,
            )
          }
          // Fallback stays visible — no swap
          return
        }

        // Client disconnected (or upstream aborted) while we were
        // resolving — don't bother enqueueing the post-resolve content.
        // The drain loop also checks `signal.aborted` so the stream
        // closes promptly without us racing it.
        if (ctx.signal?.aborted) return

        // Escape </template> in buffered content to prevent early close + XSS
        const content = buf.join('').replace(/<\/template/gi, '<\\/template')

        // Flush any styler CSS rules collected while resolving this
        // boundary's subtree — emit a `<style>` tag BEFORE the
        // `<template>` so its rules are applied to the page before
        // `__NS` swaps the resolved content in. Eliminates FOUC on
        // streaming SSR where the final consolidated `<style>` tag
        // would otherwise arrive after the boundary's HTML. No-op when
        // styler isn't loaded (e.g. apps that use vanilla CSS).
        const stylerFlush = (globalThis as { __PYREON_STYLER_FLUSH__?: () => string })
          .__PYREON_STYLER_FLUSH__
        if (stylerFlush) {
          const newRules = stylerFlush()
          if (newRules) {
            const safeCss = newRules.replace(/<\/style/gi, '<\\/style')
            mainEnqueue(`<style data-pyreon-stream="${id}">${safeCss}</style>`)
          }
        }

        mainEnqueue(`<template id="pyreon-t-${id}">${content}</template>`)
        mainEnqueue(`<script>__NS("pyreon-s-${id}","pyreon-t-${id}")</script>`)
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
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

// ─── Maybe-sync string renderer ──────────────────────────────────────────────
//
// Every function in the string-render family returns `string | Promise<string>`
// instead of always-`Promise<string>`. Fully-synchronous subtrees (the
// overwhelming majority — async components are rare) concatenate plain
// strings with ZERO promise hops; only a genuine `async function Component()`
// promotes its own subtree to a Promise, and `.then` continuations resume the
// sequential child walk from the suspension point (order preserved — earlier
// siblings' context-stack effects happen-before later siblings, exactly as
// the awaited version behaved; AsyncLocalStorage propagates through `.then`).
//
// Why: the previous shape `async renderNode` + `html += await renderNode(child)`
// paid promise machinery at EVERY node. Measured on the links-100 SSR scenario
// (≈500-node tree): ~100µs/render of which ~90µs was promise overhead — the
// actual HTML work is ~10µs. The maybe-sync rewrite removes the hops for sync
// trees while keeping async-component + Suspense semantics byte-identical.

type MaybeAsync = string | Promise<string>

/**
 * Sequentially render `children[start..]` onto `acc`. Synchronous children
 * append in the loop; the first async child returns a Promise whose `.then`
 * resumes the walk at the next index — strict left-to-right order.
 */
function renderChildList(children: readonly VNodeChild[], start: number, acc: string): MaybeAsync {
  for (let i = start; i < children.length; i++) {
    const r = renderNode(children[i] as VNodeChild)
    if (typeof r === 'string') {
      acc += r
    } else {
      const next = i + 1
      const soFar = acc
      return r.then((s) => renderChildList(children, next, soFar + s))
    }
  }
  return acc
}

function renderNode(node: VNodeChild | (() => VNodeChild)): MaybeAsync {
  // Reactive accessor — snapshot it and WRAP the output in
  // `<!--$-->…<!--/$-->` hydration range markers. The markers give hydration
  // the accessor's exact DOM extent, otherwise unknowable client-side: the
  // initial can render zero nodes (`''`/null), one text node, or MANY
  // (fragment / <For> / component). Without them, hydration removed exactly
  // ONE node before re-mounting — a multi-root initial left the rest of its
  // SSR output DUPLICATED, and adjacent text-producing siblings merged into
  // one node, misaligning the sibling cursor (fuzz-found, 2026-07). Uniform
  // (not conditional-on-value) because a marked range adjacent to an
  // unmarked one reintroduces the same cursor-alignment gaps the fuzzer
  // flags. Consistent with the framework's existing SSR hydration markers
  // (`<!--k:-->` / `<!--pyreon-for-->`); the analogue is Solid's `<!--$-->`.
  if (typeof node === 'function') {
    const inner = renderNode((node as () => VNodeChild)())
    if (typeof inner === 'string') return `<!--$-->${inner}<!--/$-->`
    return inner.then((s) => `<!--$-->${s}<!--/$-->`)
  }

  if (node == null || node === false) return ''

  if (typeof node === 'string') return escapeHtml(node)
  if (typeof node === 'number' || typeof node === 'boolean') return String(node)

  if (Array.isArray(node)) {
    return renderChildList(node, 0, '')
  }

  const vnode = node as VNode

  if (vnode.type === Fragment) {
    return renderChildList(vnode.children, 0, '')
  }

  if (vnode.type === (ForSymbol as unknown as string)) {
    const { each, children, by } = vnode.props as unknown as ForProps<unknown>
    // Defensive: `each` is normally `_rp(() => arr)` (a function).
    // `makeReactiveProps` in `mergeChildrenIntoProps` invokes `_rp` getters
    // when the For COMPONENT runs, which flips `props.each` to the resolved
    // array on the re-emitted ForSymbol vnode. Accept both forms. The
    // function arm is defensive — the For component resolves `each` to an
    // array before re-emitting the ForSymbol vnode this path renders, so a
    // function `each` is never observed here in practice.
    /* v8 ignore next */
    const items = typeof each === 'function' ? each() : (each as Iterable<unknown>)
    const arr = Array.isArray(items) ? (items as unknown[]) : [...items]
    return renderForItems(arr, by, children, 0, '<!--pyreon-for-->')
  }

  if (typeof vnode.type === 'function') {
    return renderComponent(vnode as VNode & { type: ComponentFn })
  }

  return renderElement(vnode)
}

/** Sequential keyed-item walk for `<For>` — same continuation shape as renderChildList. */
function renderForItems(
  items: readonly unknown[],
  by: (item: unknown) => unknown,
  children: (item: unknown) => unknown,
  start: number,
  acc: string,
): MaybeAsync {
  for (let i = start; i < items.length; i++) {
    const item = items[i]
    const key = by(item)
    if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('runtime-server.for.keyMarker')
    acc += `<!--k:${safeKeyForMarker(key)}-->`
    const r = renderNode(children(item) as VNodeChild)
    if (typeof r === 'string') {
      acc += r
    } else {
      const next = i + 1
      const soFar = acc
      return r.then((s) => renderForItems(items, by, children, next, soFar + s))
    }
  }
  return `${acc}<!--/pyreon-for-->`
}

function renderComponent(vnode: VNode & { type: ComponentFn }): MaybeAsync {
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('runtime-server.component')
  // Snapshot the context stack length BEFORE the component renders. After
  // children render, trim back to this length — that pops every frame the
  // component pushed via `provide(ctx, value)` (which calls `pushContext` +
  // registers `onUnmount(popContext)`). Without this, every provider during
  // SSR leaks its frame onto the global stack and subsequent siblings see
  // the wrong context value (Bug 4 — bokisch.com `<PyreonUI inversed>`
  // inside `<Intro>` flipped every later section to dark).
  //
  // We trim the stack DIRECTLY instead of running the component's unmount
  // hooks because users register `onUnmount` for things still load-bearing
  // at post-render time during SSR — `useHead({ title })` uses `onUnmount`
  // to remove its head entries, and running it here wipes the head store
  // before `renderWithHead` extracts it. SSR has no real "unmount" phase
  // (the response ships, the process moves on); user-registered cleanup
  // is for the CSR lifecycle. `provide()`'s frame cleanup is the only
  // SSR-visible side effect and we handle it structurally below.
  const stackLenBefore = getContextStackLength()
  const { vnode: output } = runWithHooks(vnode.type, mergeChildrenIntoProps(vnode))

  // Async component function (async function Component()) — await the promise.
  // We bracket the resolved HTML with `<!--$pas-->/<!--$pae-->` sentinel
  // comments so the client hydrate can locate the SSR DOM range
  // corresponding to the (still-pending) Promise and attach reactivity to
  // it. Without these markers, hydrate has no way to know where the async
  // subtree begins/ends — events, lifecycle hooks, and signal subscriptions
  // would never wire up on the server-rendered nodes. (Mirrors the
  // `streamComponentNode` marker emit on the streaming path.)
  //
  // Maybe-sync: the dominant sync-component path trims the context stack
  // synchronously and returns a plain string; promise paths trim in BOTH
  // settle branches (the `finally` equivalent — the trim must run after the
  // subtree completes, never before, so providers stay visible to children).
  if (output instanceof Promise) {
    return output.then(
      (resolved) => {
        const inner = resolved === null ? '' : renderNode(resolved)
        if (typeof inner === 'string') {
          trimContextStack(stackLenBefore)
          return `<!--$pas-->${inner}<!--$pae-->`
        }
        return inner.then(
          (s) => {
            trimContextStack(stackLenBefore)
            return `<!--$pas-->${s}<!--$pae-->`
          },
          (err: unknown) => {
            trimContextStack(stackLenBefore)
            throw err
          },
        )
      },
      (err: unknown) => {
        trimContextStack(stackLenBefore)
        throw err
      },
    )
  }
  if (output === null) {
    trimContextStack(stackLenBefore)
    return ''
  }
  const r = renderNode(output)
  if (typeof r === 'string') {
    trimContextStack(stackLenBefore)
    return r
  }
  return r.then(
    (s) => {
      trimContextStack(stackLenBefore)
      return s
    },
    (err: unknown) => {
      trimContextStack(stackLenBefore)
      throw err
    },
  )
}

/**
 * Pop context frames pushed during a component's render. Trims the global
 * context stack back to the snapshot length captured before the component
 * ran. Each iteration calls `popContext` once — symmetric with `provide()`'s
 * `pushContext()` so frames pop in LIFO order even when a single component
 * called `provide()` multiple times.
 *
 * Why not run user unmount hooks here? See `renderComponent` for the full
 * architectural rationale — TL;DR: SSR has no unmount phase, `useHead` uses
 * `onUnmount` to clear head entries that the post-render extraction still
 * needs, etc. The structural fix is to clean up the ONE SSR-visible side
 * effect of `provide()` (its context frame) without firing other hooks.
 */
function trimContextStack(targetLen: number): void {
  let current = getContextStackLength()
  while (current > targetLen) {
    popContext()
    current--
  }
}

function renderElement(vnode: VNode): MaybeAsync {
  const tag = vnode.type as string
  warnIfUnsafeTag(tag)
  let html = `<${tag}`

  const props = vnode.props as Record<string, unknown>
  for (const key in props) {
    const attr = renderProp(tag, key, props[key])
    if (attr) html += ` ${attr}`
  }

  // `<option>` inside a `<select value>` frame: mark the matching option
  // `selected` — the HTML carrier for the select's value prop (PZ-09).
  if (tag === 'option') html += optionSelectedAttr(props, vnode.children)

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
  const plainInnerHtml = typeof innerHtml === 'function' ? (innerHtml as () => string)() : innerHtml
  if (dangerousHtml) {
    html += dangerousHtml
  } else if (plainInnerHtml != null && plainInnerHtml !== '') {
    html += String(plainInnerHtml)
  } else {
    // `<select value>`: render children inside the frame's ALS scope so the
    // option renderer sees the nearest enclosing select's value (PZ-09).
    // The context follows async continuations, so an async subtree keeps
    // its frame without any pop/cleanup discipline.
    const frame = tag === 'select' ? makeSelectFrame(props) : null
    const inner = frame
      ? _selectValueAls.run(frame, () => renderChildList(vnode.children, 0, ''))
      : renderChildList(vnode.children, 0, '')
    if (typeof inner !== 'string') {
      const open = html
      return inner.then((s) => `${open}${s}</${tag}>`)
    }
    html += inner
  }

  html += `</${tag}>`
  return html
}

// URL-attribute injection guard (`URL_ATTRS` / `UNSAFE_URL_RE` /
// `isSafeImageDataUri`) is single-sourced in `@pyreon/core/url-guard` and
// shared with `@pyreon/runtime-dom`'s client `setStaticProp` — see the import
// above. Keeping it in one place is deliberate: the placeholder-stripping bug
// (`data:image/*` allowed on the client but stripped from SSG static HTML) was
// caused by the two renderers carrying independent copies that drifted.

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
  // on[A-Z]* event props — charCode probe (no regex machinery per prop)
  if (key.length > 2 && key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110) {
    const c = key.charCodeAt(2)
    if (c >= 65 && c <= 90) return true
  }
  return false
}

function renderPropValue(key: string, value: unknown): string | null {
  // ARIA state/property attributes are STRING enums ("true"/"false"/"mixed"),
  // not presence-based like HTML boolean attrs — a boolean must serialize to
  // its literal string so assistive tech reads the state (a bare `aria-checked`
  // / presence-only attr is NOT read as "true"). Mirrors runtime-dom's client
  // `applyStaticProp` so hydration sees identical markup. HTML boolean attrs +
  // data-* keep presence semantics in the branches below.
  if (typeof value === 'boolean' && key.charCodeAt(0) === 97 /* 'a' */ && key.startsWith('aria-')) {
    return `${toAttrName(key)}="${value ? 'true' : 'false'}"`
  }
  if (value === null || value === undefined || value === false) return null
  if (value === true) return toAttrName(key) // pre-escaped by the memo

  if (key === 'class') {
    const cls = cx(value as ClassValue)
    return cls ? `class="${escapeHtml(cls)}"` : null
  }

  if (key === 'style') {
    const style = normalizeStyle(value)
    return style ? `style="${escapeHtml(style)}"` : null
  }

  return `${toAttrName(key)}="${escapeHtml(String(value))}"`
}

function renderProp(tag: string, key: string, value: unknown): string | null {
  if (renderPropSkipped(key)) return null

  // `<select value>` is NOT serialized (PZ-09): <select> has no `value`
  // CONTENT attribute — the parser ignores it, so the attribute is dead
  // bytes AND a false signal to snapshot tests. The selection intent is
  // carried by marking the matching `<option selected>` instead — see
  // renderElement / streamElementNode.
  if (key === 'value' && tag === 'select') return null

  if (typeof value === 'function') {
    return renderProp(tag, key, (value as () => unknown)())
  }

  if (
    URL_ATTRS.has(key) &&
    typeof value === 'string' &&
    UNSAFE_URL_RE.test(value) &&
    !isSafeImageDataUri(tag, key, value)
  ) {
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

const UPPERCASE_RE = /[A-Z]/
function isVoidElement(tag: string): boolean {
  // JSX tags are lowercase in practice — the direct Set probe covers them
  // with ZERO allocation. The previous unconditional `tag.toLowerCase()`
  // allocated a string per rendered element (measured 4.3% of non-GC SSR
  // time). Mixed-case tags (h() callers) still resolve via the fallback.
  return VOID_ELEMENTS.has(tag) || (UPPERCASE_RE.test(tag) && VOID_ELEMENTS.has(tag.toLowerCase()))
}

/**
 * camelCase JSX prop → HTML attribute name.
 *
 * Pyreon's JSX types use React-style camelCase (`srcSet`, `fetchPriority`,
 * etc.) for ergonomics + type-checking, but the rendered HTML must use
 * the HTML-spec attribute name. Most are LOWERCASE (no dash) per the
 * spec — `srcSet → srcset`, `fetchPriority → fetchpriority`,
 * `crossOrigin → crossorigin`. A handful are genuinely kebab —
 * `accept-charset`, `http-equiv` — and the rest map to a different
 * name entirely (`className → class`, `htmlFor → for`).
 *
 * The naïve fallback (replace `[A-Z]` with `-<lower>`) is WRONG for
 * standard HTML attrs: it emits `fetch-priority` / `src-set` /
 * `cross-origin` — non-standard names browsers silently ignore. This
 * is the root cause of the `<Image priority>` body-`<img>` bug (PR #1353
 * preload worked in head via `useHead` lowercasing, but the body's
 * `<img fetchPriority="high">` emitted `fetch-priority="high"` which the
 * preload scanner / network stack ignored).
 *
 * The allow-list below mirrors React's `possibleStandardNames` for the
 * cases that diverge from the naïve kebab default. `data-*` / `aria-*` /
 * SVG `viewBox` / `clipPath` / `xlink:*` pass through their original
 * casing (the kebab fallback never fires because the JSX types model
 * them with `-`/`:` in the name already).
 */
const HTML_ATTRIBUTE_MAP: Record<string, string> = {
  // Renamed entirely
  className: 'class',
  htmlFor: 'for',
  // camelCase → all-lowercase (no dash)
  srcSet: 'srcset',
  fetchPriority: 'fetchpriority',
  imageSrcSet: 'imagesrcset',
  imageSizes: 'imagesizes',
  crossOrigin: 'crossorigin',
  referrerPolicy: 'referrerpolicy',
  playsInline: 'playsinline',
  noModule: 'nomodule',
  tabIndex: 'tabindex',
  readOnly: 'readonly',
  maxLength: 'maxlength',
  minLength: 'minlength',
  colSpan: 'colspan',
  rowSpan: 'rowspan',
  formNoValidate: 'formnovalidate',
  formEncType: 'formenctype',
  formMethod: 'formmethod',
  formTarget: 'formtarget',
  formAction: 'formaction',
  autoFocus: 'autofocus',
  autoComplete: 'autocomplete',
  autoPlay: 'autoplay',
  autoCapitalize: 'autocapitalize',
  autoCorrect: 'autocorrect',
  dateTime: 'datetime',
  dirName: 'dirname',
  encType: 'enctype',
  inputMode: 'inputmode',
  enterKeyHint: 'enterkeyhint',
  hrefLang: 'hreflang',
  isMap: 'ismap',
  itemId: 'itemid',
  itemProp: 'itemprop',
  itemRef: 'itemref',
  itemScope: 'itemscope',
  itemType: 'itemtype',
  spellCheck: 'spellcheck',
  contentEditable: 'contenteditable',
  noValidate: 'novalidate',
  useMap: 'usemap',
  frameBorder: 'frameborder',
  marginHeight: 'marginheight',
  marginWidth: 'marginwidth',
  allowFullScreen: 'allowfullscreen',
  allowTransparency: 'allowtransparency',
  mediaGroup: 'mediagroup',
  controlsList: 'controlslist',
  disablePictureInPicture: 'disablepictureinpicture',
  disableRemotePlayback: 'disableremoteplayback',
  radioGroup: 'radiogroup',
  srcLang: 'srclang',
  popoverTarget: 'popovertarget',
  popoverTargetAction: 'popovertargetaction',
  // camelCase → kebab-case (HTML spec uses the dash)
  acceptCharset: 'accept-charset',
  httpEquiv: 'http-equiv',
}

/**
 * SVG attribute name map. SVG is case-sensitive: some attrs MUST be
 * camelCase (`viewBox`, `preserveAspectRatio`), some are kebab-case
 * CSS-style properties (`stroke-width`, `text-anchor`), and some map
 * to either form depending on context. React maintains a complete
 * mapping (`SVGDOMPropertyConfig.js`); this covers the production set
 * of attrs a Pyreon user is likely to write in JSX.
 *
 * Why a separate map: HTML's default for camelCase is "lowercase"
 * (in HTML_ATTRIBUTE_MAP) or kebab (the fallback); SVG breaks both
 * rules. `viewBox` MUST stay `viewBox` — browser silently ignores
 * `view-box` or `viewbox`. `strokeWidth` MUST become `stroke-width`
 * (CSS-style kebab) — browser doesn't know `strokewidth`.
 *
 * Lookup order in `toAttrName`: HTML_ATTRIBUTE_MAP first (the
 * authoritative source for HTML attrs), then SVG_ATTRIBUTE_MAP, then
 * the kebab fallback. Some attrs (like `tabIndex`) are shared between
 * HTML + SVG and live in HTML_ATTRIBUTE_MAP; the SVG-only entries
 * here cover what the HTML map doesn't.
 */
const SVG_ATTRIBUTE_MAP: Record<string, string> = {
  // camelCase preserved (SVG canonical form)
  viewBox: 'viewBox',
  preserveAspectRatio: 'preserveAspectRatio',
  gradientUnits: 'gradientUnits',
  gradientTransform: 'gradientTransform',
  patternUnits: 'patternUnits',
  patternContentUnits: 'patternContentUnits',
  patternTransform: 'patternTransform',
  attributeName: 'attributeName',
  attributeType: 'attributeType',
  baseFrequency: 'baseFrequency',
  calcMode: 'calcMode',
  clipPathUnits: 'clipPathUnits',
  diffuseConstant: 'diffuseConstant',
  edgeMode: 'edgeMode',
  filterRes: 'filterRes',
  filterUnits: 'filterUnits',
  kernelMatrix: 'kernelMatrix',
  kernelUnitLength: 'kernelUnitLength',
  keyPoints: 'keyPoints',
  keySplines: 'keySplines',
  keyTimes: 'keyTimes',
  lengthAdjust: 'lengthAdjust',
  limitingConeAngle: 'limitingConeAngle',
  markerHeight: 'markerHeight',
  markerUnits: 'markerUnits',
  markerWidth: 'markerWidth',
  maskContentUnits: 'maskContentUnits',
  maskUnits: 'maskUnits',
  numOctaves: 'numOctaves',
  pathLength: 'pathLength',
  pointsAtX: 'pointsAtX',
  pointsAtY: 'pointsAtY',
  pointsAtZ: 'pointsAtZ',
  repeatCount: 'repeatCount',
  repeatDur: 'repeatDur',
  requiredExtensions: 'requiredExtensions',
  requiredFeatures: 'requiredFeatures',
  specularConstant: 'specularConstant',
  specularExponent: 'specularExponent',
  spreadMethod: 'spreadMethod',
  startOffset: 'startOffset',
  stdDeviation: 'stdDeviation',
  stitchTiles: 'stitchTiles',
  surfaceScale: 'surfaceScale',
  systemLanguage: 'systemLanguage',
  tableValues: 'tableValues',
  targetX: 'targetX',
  targetY: 'targetY',
  textLength: 'textLength',
  xChannelSelector: 'xChannelSelector',
  yChannelSelector: 'yChannelSelector',
  zoomAndPan: 'zoomAndPan',
  // camelCase → kebab-case (SVG CSS-property style)
  strokeWidth: 'stroke-width',
  strokeLinecap: 'stroke-linecap',
  strokeLinejoin: 'stroke-linejoin',
  strokeOpacity: 'stroke-opacity',
  strokeDasharray: 'stroke-dasharray',
  strokeDashoffset: 'stroke-dashoffset',
  strokeMiterlimit: 'stroke-miterlimit',
  fillOpacity: 'fill-opacity',
  fillRule: 'fill-rule',
  clipPath: 'clip-path',
  clipRule: 'clip-rule',
  floodColor: 'flood-color',
  floodOpacity: 'flood-opacity',
  stopColor: 'stop-color',
  stopOpacity: 'stop-opacity',
  textAnchor: 'text-anchor',
  alignmentBaseline: 'alignment-baseline',
  baselineShift: 'baseline-shift',
  dominantBaseline: 'dominant-baseline',
  letterSpacing: 'letter-spacing',
  lightingColor: 'lighting-color',
  markerEnd: 'marker-end',
  markerStart: 'marker-start',
  markerMid: 'marker-mid',
  pointerEvents: 'pointer-events',
  shapeRendering: 'shape-rendering',
  textDecoration: 'text-decoration',
  textRendering: 'text-rendering',
  vectorEffect: 'vector-effect',
  wordSpacing: 'word-spacing',
  writingMode: 'writing-mode',
  imageRendering: 'image-rendering',
  colorInterpolation: 'color-interpolation',
  colorInterpolationFilters: 'color-interpolation-filters',
  colorRendering: 'color-rendering',
  glyphOrientationHorizontal: 'glyph-orientation-horizontal',
  glyphOrientationVertical: 'glyph-orientation-vertical',
}

// Resolved-name memo: prop keys are code-shaped (a real app uses a few
// dozen distinct keys across millions of renderProp calls), so the map +
// kebab-regex work is paid once per distinct key per process. The cached
// value is ALSO pre-escaped (attr names land directly in markup), so
// callers skip their per-call escapeHtml on the name. Bounded at 1,000
// entries (leak-class C discipline) — beyond the cap, pathological
// dynamic-key spreads fall through to the uncached path.
const _attrNameCache = new Map<string, string>()
function toAttrName(key: string): string {
  const cached = _attrNameCache.get(key)
  if (cached !== undefined) return cached
  const resolved =
    HTML_ATTRIBUTE_MAP[key] ??
    SVG_ATTRIBUTE_MAP[key] ??
    // Fallback: camelCase → kebab-case. Preserves the existing convention
    // for unknown / user-defined camelCase props (e.g. `dataTestId` →
    // `data-test-id`). Tests in `ssr.test.ts:650` lock the fallback.
    key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
  const escaped = escapeHtml(resolved)
  if (_attrNameCache.size < 1000) _attrNameCache.set(key, escaped)
  return escaped
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
        // Custom properties (`--x`) are case-sensitive and MUST pass through
        // verbatim — kebab-casing them corrupts the name. Mirrors the client
        // `applyStyleProp` guard (`runtime-dom/src/props.ts`); without it SSR
        // and the client disagree on any `--Custom`-cased property (the inline
        // custom properties the CPSE style-extraction path emits).
        // Custom properties (`--x`) are case-sensitive and MUST pass through
        // verbatim — kebab-casing them corrupts the name. Mirrors the client
        // `applyStyleProp` guard (`runtime-dom/src/props.ts`); without it SSR
        // and the client disagree on any `--Custom`-cased property (the inline
        // custom properties the CPSE style-extraction path emits).
        .map(([k, v]) => `${k.startsWith('--') ? k : toKebab(k)}: ${normalizeStyleValue(k, v)}`)
        .join('; ')
    }
  }
  return ''
}

function toKebab(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
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
// Keys made only of [\w.:] can never form `--` (no dash at all), so they
// are comment-safe verbatim — and `%` is excluded, so decodeURIComponent
// round-trips them unchanged. Number.prototype.toString likewise never
// emits consecutive dashes ("-5", "1.5e-7"). Both fast paths skip the
// encodeURIComponent + replace pair, which measured ~7% of non-GC SSR
// time on list-heavy pages (numeric ids are the dominant <For> key).
const SIMPLE_KEY_RE = /^[\w.:]+$/
function safeKeyForMarker(key: unknown): string {
  if (typeof key === 'number') return String(key)
  const s = String(key)
  if (SIMPLE_KEY_RE.test(s)) return s
  return encodeURIComponent(s).replace(/-/g, '%2D')
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
  if (process.env.NODE_ENV === 'production') return
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
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('runtime-server.escape')
  // Dirty path: manual charCode scan with lazy slicing. The previous
  // `.replace(/g, callback)` paid a function call + map lookup PER MATCH —
  // the scan emits contiguous clean runs via slice and appends the entity
  // directly (escaping measured ~19% of non-GC SSR time in the CPU
  // profile; see scripts/bench-ssr.ts).
  let out = ''
  let last = 0
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    let entity: string | null = null
    if (c === 38) entity = '&amp;'
    else if (c === 60) entity = '&lt;'
    else if (c === 62) entity = '&gt;'
    else if (c === 34) entity = '&quot;'
    else if (c === 39) entity = '&#39;'
    if (entity !== null) {
      out += str.slice(last, i) + entity
      last = i + 1
    }
  }
  return out + str.slice(last)
}

/**
 * Merge vnode.children into props.children for component rendering, AND
 * convert compiler-emitted `_rp(() => expr)` reactive-prop wrappers into
 * getter properties via `makeReactiveProps`.
 *
 * mount.ts (CSR) does the same dance — without it, components reading
 * `props.x` get the raw `_rp` function instead of the resolved value.
 * Pre-fix, SSR (and hydrate.ts — same bug, fixed alongside) skipped the
 * `makeReactiveProps` step, so any `<Comp prop={signal()}>` shape rendered
 * the function source as the attribute value (e.g. `<a href="() => …">`).
 * Visible end-to-end through the fundamentals NavItem layout — see
 * `e2e/fundamentals/playground.spec.ts`.
 */
function mergeChildrenIntoProps(vnode: VNode): Record<string, unknown> {
  const raw =
    vnode.children.length > 0 && (vnode.props as Record<string, unknown>).children === undefined
      ? {
          ...vnode.props,
          children: vnode.children.length === 1 ? vnode.children[0] : vnode.children,
        }
      : (vnode.props as Record<string, unknown>)
  return makeReactiveProps(raw)
}
