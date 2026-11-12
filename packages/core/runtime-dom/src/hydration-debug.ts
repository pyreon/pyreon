/**
 * Hydration mismatch warnings + telemetry hook.
 *
 * Two complementary surfaces:
 *
 * 1. **Dev-mode console.warn** — enabled automatically when
 *    `NODE_ENV !== "production"` (and silent otherwise, matching React /
 *    Vue / Solid). Toggle manually with `enableHydrationWarnings()` /
 *    `disableHydrationWarnings()` if you need verbose production debugging.
 *
 * 2. **Telemetry callback** — register a handler with
 *    `onHydrationMismatch(handler)` to forward every mismatch into your
 *    error-tracking pipeline (Sentry, Datadog, etc.). Fires on EVERY
 *    mismatch, in development AND production, regardless of the warn
 *    toggle. Returns an unregister function.
 *
 * The dev warn and the telemetry callback are independent: a production
 * deployment can install Sentry forwarding via `onHydrationMismatch`
 * WITHOUT enabling the noisy console output.
 *
 * @example — dev console
 * import { enableHydrationWarnings } from "@pyreon/runtime-dom"
 * enableHydrationWarnings()
 *
 * @example — production telemetry
 * import { onHydrationMismatch } from "@pyreon/runtime-dom"
 * import * as Sentry from "@sentry/browser"
 *
 * onHydrationMismatch(ctx => {
 *   Sentry.captureMessage(`Hydration mismatch (${ctx.type})`, {
 *     extra: { expected: ctx.expected, actual: ctx.actual, path: ctx.path },
 *     level: 'warning',
 *   })
 * })
 */

// Dev-mode gate: see `pyreon/no-process-dev-gate` lint rule for why this
// uses `import.meta.env.DEV` instead of `typeof process !== 'undefined'`.
let _enabled = process.env.NODE_ENV !== 'production'

export function enableHydrationWarnings(): void {
  _enabled = true
}

export function disableHydrationWarnings(): void {
  _enabled = false
}

// ─── Telemetry callback ─────────────────────────────────────────────────────

export type HydrationMismatchType = 'tag' | 'text' | 'missing'

export interface HydrationMismatchContext {
  /** Kind of mismatch */
  type: HydrationMismatchType
  /** What the VNode expected */
  expected: unknown
  /** What the DOM had */
  actual: unknown
  /** Human-readable path in the tree, e.g. "root > div > span" */
  path: string
  /** Unix timestamp (ms) */
  timestamp: number
}

export type HydrationMismatchHandler = (ctx: HydrationMismatchContext) => void

let _handlers: HydrationMismatchHandler[] = []

/**
 * Register a hydration mismatch handler. Called on every mismatch in BOTH
 * development and production, independent of the dev-mode warn toggle.
 *
 * Mirrors `@pyreon/core`'s `registerErrorHandler` pattern — multiple
 * handlers can be registered; each is called in registration order;
 * handler errors are swallowed so they don't propagate into the
 * framework. Returns an unregister function.
 */
export function onHydrationMismatch(handler: HydrationMismatchHandler): () => void {
  _handlers.push(handler)
  return () => {
    _handlers = _handlers.filter((h) => h !== handler)
  }
}

/**
 * Emit a hydration mismatch warning.
 * @param type  - Kind of mismatch
 * @param expected - What the VNode expected
 * @param actual   - What the DOM had
 * @param path     - Human-readable path in the tree, e.g. "root > div > span"
 */
export function warnHydrationMismatch(
  type: HydrationMismatchType,
  expected: unknown,
  actual: unknown,
  path: string,
): void {
  // Dev-mode console.warn — gated on _enabled (default __DEV__).
  if (_enabled) {
    // oxlint-disable-next-line no-console
    console.warn(
      `[Pyreon] Hydration mismatch (${type}): expected ${String(expected)}, got ${String(actual)} at ${path}`,
    )
  }

  // Telemetry callbacks — fire in BOTH dev and prod, independent of the
  // warn toggle. This is the production observability hook (Sentry,
  // Datadog, etc.) that pre-fix was missing entirely.
  if (_handlers.length > 0) {
    const ctx: HydrationMismatchContext = {
      type,
      expected,
      actual,
      path,
      timestamp: Date.now(),
    }
    for (const h of _handlers) {
      try {
        h(ctx)
      } catch {
        // handler errors must never propagate back into the hydration
        // pipeline — a broken Sentry SDK shouldn't crash the app.
      }
    }
  }
}

// ─── Compiled-template adoption (dev only) ──────────────────────────────────
//
// A compiled `_tpl` adopts the server's DOM and its bind writes the client's
// values into it. The h() path reports a divergence as it walks; the compiled
// binders used to correct it silently (#4419). Each binder now compares its
// first write against the server text it adopted and reports when the write
// CHANGES it: "a mismatch is reported exactly when hydration changes server
// text". A value the server already rendered (whatever its whitespace) is
// never reported, and every rewrite is, as on the h() path, which also
// compares exactly.
//
// Everything below is reached only from `process.env.NODE_ENV !== 'production'`
// blocks, and the call sites are written so those blocks are the ONLY change
// (no variable or wrapper survives in production), so production bundles carry
// none of it.

/** True while a compiled template's bind runs against ADOPTED server DOM. */
export let _adoptingCompiledBind = false

/** Run `bind(target)` with the adoption flag set to `adopting`, restoring the
 *  previous value after (binds nest through child templates). */
export function _bindWithAdoption<T, R>(adopting: boolean, bind: (target: T) => R, target: T): R {
  const prev = _adoptingCompiledBind
  _adoptingCompiledBind = adopting
  try {
    return bind(target)
  } finally {
    _adoptingCompiledBind = prev
  }
}

/** Containers `hydrateRoot` is walking, innermost last (roots nest via
 *  islands): compiled mismatch paths start at the innermost. */
const _pathRoots: Node[] = []
export function _pushPathRoot(root: Node): void {
  _pathRoots.push(root)
}
/** Removed by identity, not `pop()`: a root that finishes out of order must
 *  not take another root's entry with it (leak class A). */
export function _popPathRoot(root: Node): void {
  const i = _pathRoots.lastIndexOf(root)
  if (i !== -1) _pathRoots.splice(i, 1)
}

/** `root > div > p` for the element `parent`: the path an h() walk passes to
 *  that element's children. A compiled bind has only the DOM, so the element
 *  ancestors up to the hydration container stand in for the vnodes. */
export function compiledParentPath(parent: Node | null): string {
  const root = _pathRoots.length > 0 ? _pathRoots[_pathRoots.length - 1] : null
  const parts: string[] = []
  let n: Node | null = parent
  while (n !== null && n !== root && n.nodeType === 1) {
    parts.push((n as Element).tagName.toLowerCase())
    n = n.parentNode
  }
  parts.push('root')
  return parts.reverse().join(' > ')
}

export function compiledMismatchPath(parent: Node | null, leaf: string): string {
  return `${compiledParentPath(parent)} > ${leaf}`
}

/** Brand: the server text a FRESH node stands in for (`_textSlot` hands the
 *  bind a new node when the server range was empty or held another shape).
 *  On the node, not in a registry keyed by node (leak class C). */
const SERVER_TEXT: unique symbol = /* @__PURE__ */ Symbol('pyreon.serverText')
type BrandedText = Text & { [SERVER_TEXT]?: string }

export function _markServerText(fresh: Text, serverText: string): void {
  ;(fresh as BrandedText)[SERVER_TEXT] = serverText
}

/** The text of a server range opened by `open` (`<!--$-->…<!--/$-->`,
 *  depth-aware), before `_textSlot` discards it. */
export function rangeText(open: Comment): string {
  let text = ''
  let depth = 0
  for (let n: ChildNode | null = open; n !== null; n = n.nextSibling) {
    if (n.nodeType === 8) {
      const d = (n as Comment).data
      if (d === '$') depth++
      else if (d === '/$' && --depth === 0) break
    } else {
      text += n.textContent ?? ''
    }
  }
  return text
}

/**
 * A text binder's FIRST write into adopted server text: report it when it
 * will change what the server rendered. `value` is the raw value (a VNode or
 * accessor is mounted, not written as text, and is not this report's
 * business); `next` is the string the binder writes.
 */
export function reportFirstText(node: Text, value: unknown, next: string, leaf: 'text' | 'reactive'): void {
  if (value !== null && (typeof value === 'object' || typeof value === 'function')) return
  const branded = (node as BrandedText)[SERVER_TEXT]
  const server = branded !== undefined ? branded : node.data
  if (server !== next) {
    warnHydrationMismatch('text', next, server, compiledMismatchPath(node.parentNode, leaf))
  }
}

/** A static write already made: report it if it changed the server's text
 *  (`before`, read just ahead of the write). `node` is the written text node,
 *  or the element whose text content was set. */
export function reportTextWrite(node: Node, before: string, leaf: 'text' | 'reactive'): void {
  const after = node.nodeType === 3 ? (node as Text).data : (node.textContent ?? '')
  if (after === before) return
  warnHydrationMismatch(
    'text',
    after,
    before,
    compiledMismatchPath(node.nodeType === 3 ? node.parentNode : node, leaf),
  )
}
