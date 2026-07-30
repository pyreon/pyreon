/**
 * A DOM for the verify pipeline.
 *
 * The runtime verify checks (`interaction` today; `reactivityCoverage`, `leak`
 * and `snapshot` are still stubs) exist for one reason: they need the component
 * MOUNTED, and `createAtlas` runs in Node. Everything Atlas can conclude from
 * types alone is already concluded — what is left needs the thing to actually
 * run.
 *
 * The order below is deliberate. A real browser, when there is one, always
 * wins; happy-dom is the fallback, never the preference. It is not a browser
 * (no layout, no real style resolution, several CSSOM behaviours unmodelled),
 * so a check built on it must claim only what survives that gap — which is why
 * the checks that ship on this harness are about *what threw* and *what fired*,
 * never about what something looks like.
 *
 * When no DOM can be had, the caller SKIPS with the reason. It does not pass:
 * "nothing examined this" presenting as "clean" is the exact false-green the
 * `checked` field exists to prevent.
 */

import { isClient } from '@pyreon/reactivity'

/** A DOM the harness can mount into. */
export interface DomEnv {
  document: Document
  /** Restore whatever globals were replaced. Safe to call twice. */
  teardown(): void
  /** How this DOM was obtained — reported by checks so a verdict is legible. */
  kind: 'ambient' | 'happy-dom'
}

/** Globals `@pyreon/runtime-dom` reaches for while mounting. */
const GLOBAL_KEYS = [
  'document',
  'window',
  'navigator',
  'Node',
  'Element',
  'HTMLElement',
  'SVGElement',
  'Event',
  'CustomEvent',
  'MouseEvent',
  'KeyboardEvent',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'MutationObserver',
  'ResizeObserver',
] as const

/** Why a DOM could not be obtained — surfaced verbatim in the skip reason. */
export type DomFailure = string

export type DomResult = { ok: true; env: DomEnv } | { ok: false; reason: DomFailure }

/**
 * Obtain a DOM, preferring one that already exists.
 *
 * An ambient `document` means we are in a browser, or inside a runner that has
 * already installed one — either way, installing a second would be worse than
 * useless: two DOMs means the component mounts into one while the framework's
 * module-level state (delegation roots, the styler sheet) points at the other.
 */
export async function ensureDom(): Promise<DomResult> {
  // `isClient` from `@pyreon/reactivity` rather than a local `typeof document`
  // or a `globalThis` cast: the framework owns one answer to "is there a DOM",
  // and re-deriving it per package is how packages ended up disagreeing about
  // it. `createElement` is still checked, because this module then USES the
  // document — `isClient` says a document exists, not that it is usable.
  if (isClient) {
    const ambient = document
    if (typeof ambient.createElement === 'function') {
      return { ok: true, env: { document: ambient, teardown: () => {}, kind: 'ambient' } }
    }
  }

  // Typed structurally rather than via happy-dom's own types: this import is
  // optional at runtime, and importing its types would put a devDependency in
  // the published type graph of a module whose whole point is to work without
  // it.
  type WindowCtor = new (opts?: { url?: string }) => Record<string, unknown>
  let Window: WindowCtor | undefined
  try {
    const mod = (await import('happy-dom')) as unknown as { Window?: WindowCtor }
    Window = mod.Window
  } catch {
    return {
      ok: false,
      reason:
        'no DOM available — these checks mount the component. Run them in a browser context, or install `happy-dom`.',
    }
  }
  if (!Window) return { ok: false, reason: 'happy-dom resolved without a `Window` export' }

  const win = new Window({ url: 'http://localhost' })
  const target = globalThis as unknown as Record<string, unknown>
  // Every replaced key is recorded with its ORIGINAL descriptor, including the
  // absent case, so teardown restores "there was no `document` here" rather
  // than leaving an `undefined` binding behind — a subsequent `typeof document
  // !== 'undefined'` check must see the same answer it saw before.
  const saved = new Map<string, PropertyDescriptor | undefined>()

  const restore = (): void => {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(target, key, descriptor)
      else delete target[key]
    }
    saved.clear()
  }

  try {
    for (const key of GLOBAL_KEYS) {
      const value = key === 'window' ? win : win[key]
      if (value === undefined) continue
      saved.set(key, Object.getOwnPropertyDescriptor(target, key))
      Object.defineProperty(target, key, { value, configurable: true, writable: true })
    }
  } catch (err) {
    // Failing PART WAY through leaves the process with some globals swapped and
    // no handle to put them back — every later `typeof document` in the same
    // process then reads a DOM that nothing owns. Undo what was done and report
    // no DOM, which the caller already knows how to skip on.
    restore()
    const detail = err instanceof Error ? err.message : String(err)
    return { ok: false, reason: `could not install a DOM on this runtime: ${detail}` }
  }

  let torn = false
  return {
    ok: true,
    env: {
      document: win.document as Document,
      kind: 'happy-dom',
      teardown() {
        if (torn) return
        torn = true
        restore()
        const close = (win as { happyDOM?: { close?: () => unknown } }).happyDOM?.close
        if (typeof close === 'function') void close.call((win as { happyDOM: unknown }).happyDOM)
      },
    },
  }
}
