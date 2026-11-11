import type { VNodeChild } from '@pyreon/core'
/**
 * @pyreon/react-compat/dom
 *
 * Drop-in for `react-dom` AND `react-dom/client` — the Vite plugin's compat
 * mode aliases both specifiers here, so this entry carries React 19's whole
 * public surface of both: what Pyreon has a mechanism for is implemented,
 * and what it does not have (`findDOMNode`, form-action status) throws a
 * `[Pyreon]` error naming the replacement instead of failing as a missing
 * import. `REACT_DOM_SURFACE` in the tests locks the list.
 */
import { batch, isServer } from '@pyreon/reactivity'
import { hydrateRoot as pyreonHydrateRoot, mount } from '@pyreon/runtime-dom'

export { createPortal, flushSync, version } from './index'

/** React's `unstable_batchedUpdates` — Pyreon's `batch()` (one flush for the writes inside `fn`). */
export function unstable_batchedUpdates<A, R>(fn: (a: A) => R, a?: A): R {
  let out!: R
  batch(() => {
    out = fn(a as A)
  })
  return out
}

/** The object `createRoot` / `hydrateRoot` return. */
export interface Root {
  render: (element: VNodeChild) => void
  unmount: () => void
}

/**
 * Drop-in for React 18's `createRoot(container).render(element)`.
 *
 * @example
 * import { createRoot } from "@pyreon/react-compat/dom"
 * createRoot(document.getElementById("app")!).render(<App />)
 */
export function createRoot(container: Element): Root {
  let cleanup: (() => void) | null = null
  return {
    render(element: VNodeChild) {
      if (cleanup) cleanup()
      cleanup = mount(element, container as HTMLElement)
    },
    unmount() {
      if (cleanup) {
        cleanup()
        cleanup = null
      }
    },
  }
}

/**
 * React 18's `hydrateRoot(container, initialChildren)` — adopts the server
 * markup in `container` and returns a root. A later `root.render(next)`
 * replaces the hydrated tree (Pyreon re-mounts; there is no reconciler).
 */
export function hydrateRoot(
  container: Element,
  initialChildren: VNodeChild,
  _options?: unknown,
): Root {
  let cleanup: (() => void) | null = pyreonHydrateRoot(container, initialChildren)
  return {
    render(element: VNodeChild) {
      if (cleanup) cleanup()
      cleanup = mount(element, container as HTMLElement)
    },
    unmount() {
      if (cleanup) {
        cleanup()
        cleanup = null
      }
    },
  }
}

// Legacy (React 17) root API. Keyed WEAKLY by container: an entry lives as long
// as the container element, and `unmountComponentAtNode` / a re-render remove it.
const legacyRoots = new WeakMap<Element, () => void>()

/** React 17's `render(element, container)`. Rendering into the same container again replaces the tree. */
export function render(element: VNodeChild, container: Element): void {
  legacyRoots.get(container)?.()
  legacyRoots.set(container, mount(element, container as HTMLElement))
}

/** React 17's `hydrate(element, container)`. */
export function hydrate(element: VNodeChild, container: Element): void {
  legacyRoots.get(container)?.()
  legacyRoots.set(container, pyreonHydrateRoot(container, element))
}

/** React 17's `unmountComponentAtNode(container)` — `true` if a tree rendered by `render` / `hydrate` was removed. */
export function unmountComponentAtNode(container: Element): boolean {
  const cleanup = legacyRoots.get(container)
  if (!cleanup) return false
  legacyRoots.delete(container)
  cleanup()
  return true
}

/** Removed in React 19; Pyreon has no component instances to resolve. */
export function findDOMNode(_instance: unknown): never {
  throw new Error(
    '[Pyreon] findDOMNode is not provided by @pyreon/react-compat (React 19 removed it, and Pyreon ' +
      'components have no instances to resolve). Put a ref on the element instead: ' +
      '`const el = useRef(null); <div ref={el} />`.',
  )
}

// ─── Form-action status (React 19) ───────────────────────────────────────────

/** Not provided: Pyreon has no `<form action={fn}>` runtime to report on. */
export function useFormStatus(): never {
  throw new Error(
    '[Pyreon] useFormStatus is not provided by @pyreon/react-compat (there is no form-action ' +
      'runtime behind `<form action>`). Track the pending state where the submit happens — ' +
      '`const [state, submit, isPending] = useActionState(fn, init)` — and pass `isPending` down.',
  )
}

/** Not provided: see {@link useFormStatus}. */
export function requestFormReset(_form: HTMLFormElement): never {
  throw new Error(
    '[Pyreon] requestFormReset is not provided by @pyreon/react-compat (there is no form-action ' +
      'runtime). Call `form.reset()` on the element (via a ref) after your submit handler finishes.',
  )
}

// ─── Resource hints (React 19) ───────────────────────────────────────────────
// Each inserts one `<link>` / `<script>` into <head>, deduplicated by looking
// for an existing element (no module-level cache). No-ops without a document
// (SSR): the server has no head to add to here.

interface HintOptions {
  as?: string
  crossOrigin?: string
  integrity?: string
  type?: string
  fetchPriority?: 'high' | 'low' | 'auto'
  nonce?: string
  media?: string
}

function addHeadElement(
  tag: 'link' | 'script',
  key: Record<string, string>,
  extra: Record<string, string | undefined> = {},
): void {
  if (isServer) return
  const selector =
    tag +
    Object.entries(key)
      .map(([k, v]) => `[${k}="${CSS.escape(v)}"]`)
      .join('')
  if (document.head.querySelector(selector)) return
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries({ ...key, ...extra })) {
    if (v !== undefined)
      el.setAttribute(
        k === 'crossOrigin' ? 'crossorigin' : k === 'fetchPriority' ? 'fetchpriority' : k,
        v,
      )
  }
  if (tag === 'script') (el as HTMLScriptElement).async = true
  document.head.appendChild(el)
}

/** React 19 `preconnect(href)` → `<link rel="preconnect">`. */
export function preconnect(href: string, options: { crossOrigin?: string } = {}): void {
  addHeadElement('link', { rel: 'preconnect', href }, { crossOrigin: options.crossOrigin })
}

/** React 19 `prefetchDNS(href)` → `<link rel="dns-prefetch">`. */
export function prefetchDNS(href: string): void {
  addHeadElement('link', { rel: 'dns-prefetch', href })
}

/** React 19 `preload(href, { as })` → `<link rel="preload">`. */
export function preload(href: string, options: HintOptions): void {
  addHeadElement(
    'link',
    { rel: 'preload', href },
    {
      as: options.as,
      crossOrigin: options.crossOrigin,
      integrity: options.integrity,
      type: options.type,
      fetchPriority: options.fetchPriority,
      nonce: options.nonce,
      media: options.media,
    },
  )
}

/** React 19 `preloadModule(href)` → `<link rel="modulepreload">`. */
export function preloadModule(href: string, options: HintOptions = {}): void {
  addHeadElement(
    'link',
    { rel: 'modulepreload', href },
    { crossOrigin: options.crossOrigin, integrity: options.integrity, nonce: options.nonce },
  )
}

/**
 * React 19 `preinit(href, { as })` — loads and EXECUTES/APPLIES the resource:
 * `as: 'style'` → `<link rel="stylesheet">`, `as: 'script'` → `<script async>`.
 */
export function preinit(href: string, options: HintOptions & { as: 'style' | 'script' }): void {
  if (options.as === 'style') {
    addHeadElement(
      'link',
      { rel: 'stylesheet', href },
      {
        crossOrigin: options.crossOrigin,
        integrity: options.integrity,
        fetchPriority: options.fetchPriority,
      },
    )
  } else {
    addHeadElement(
      'script',
      { src: href },
      {
        crossOrigin: options.crossOrigin,
        integrity: options.integrity,
        nonce: options.nonce,
        fetchPriority: options.fetchPriority,
      },
    )
  }
}

/** React 19 `preinitModule(href)` → `<script type="module" async>`. */
export function preinitModule(href: string, options: HintOptions = {}): void {
  addHeadElement(
    'script',
    { src: href, type: 'module' },
    { crossOrigin: options.crossOrigin, integrity: options.integrity, nonce: options.nonce },
  )
}
