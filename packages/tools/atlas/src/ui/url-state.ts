/**
 * URL state — make a workbench view shareable and survive a reload.
 *
 * Today every reload drops you back on the first component with default
 * controls, and there is no way to hand someone "the button, in the error
 * state, at tablet width". That is the difference between a tool you point at
 * and a tool you *link to* — a bug report saying "open Atlas, pick X, set Y,
 * switch to Z" is one nobody follows.
 *
 * Pure: parse and serialise only. The model applies it and the shell writes it,
 * so the interesting decisions — which state is worth persisting, how a stale
 * link degrades — are testable without a DOM or a history stack.
 */

/** The slice of workbench state a link carries. */
export interface UrlState {
  /** selected component id */
  c?: string
  /** addon panel tab */
  p?: string
  /** control values, per the selected component */
  args?: Record<string, unknown>
  /** canvas addons worth sharing */
  viewport?: string
  background?: string
  locale?: string
  /** brand + dark mode: a screenshot of a bug is mode-specific */
  brand?: string
  dark?: boolean
  /** The view — canvas / docs / lab. Without it a Docs page could not be linked to. */
  view?: string
  /** A forced pseudo state (hover / focus / active / disabled). */
  pseudo?: string
  /** The Data panel's query state (success / loading / error / empty / refetching). */
  query?: string
  /** The Roles panel's active role. */
  role?: string
}

/**
 * Args are JSON in ONE parameter rather than one parameter per control.
 *
 * A control key can be any prop name, including one that collides with a
 * reserved key here (`c`, `p`, `viewport`…). Flattening them into the query
 * string would make `?c=…` ambiguous between "the component" and "a prop named
 * c", and the collision would surface as a control silently not applying.
 */
const ARGS_KEY = 'args'

/**
 * Read the selected component out of the PATH, when the path names one.
 *
 * `atlas build` emits a directory per component, so `/atlas/button/` is a real
 * URL a person can paste into a chat and a crawler can index — which
 * `/atlas/?c=button` is not. This is the reading half.
 *
 * Deliberately base-agnostic: it takes the LAST non-empty segment and only
 * accepts it if the catalog already contains that id. Deriving the base
 * instead would mean knowing it, and the base is a deploy-time choice
 * (`--base /atlas/`, `/`, a user's own subdirectory) that this layer has no
 * honest way to learn. Checking membership makes a wrong guess impossible:
 * an unrecognised segment simply is not a component, and the caller falls back
 * to the query string.
 *
 * The residual is a deploy whose own last path segment collides with a
 * component id (a site served AT `/button/`). It resolves to that component,
 * which is the same thing the link would have meant anyway.
 */
export function componentFromPath(pathname: string, ids: Iterable<string>): string | undefined {
  const segments = pathname.split('/').filter((s) => s.length > 0)
  const last = segments.at(-1)
  if (last === undefined) return undefined
  const decoded = decodeSegment(last)
  if (decoded === undefined) return undefined
  for (const id of ids) if (id === decoded) return decoded
  return undefined
}

/**
 * `decodeURIComponent`, with a malformed escape reported as "no match".
 *
 * The segment travelled through a URL, so it is percent-encoded; ids are slugs
 * so this is normally a no-op. A hand-mangled URL (`/%E0%A4%A/`) makes
 * `decodeURIComponent` THROW, and this runs on a render path where an
 * exception would blank the workbench over a typo in the address bar.
 */
function decodeSegment(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment)
  } catch {
    return undefined
  }
}

/**
 * The directory a component page lives under — the writing half's prefix.
 *
 * Given the current pathname and the id the path resolved to, returns the part
 * BEFORE it, with a trailing slash. When the path does not end in a component
 * (the site root), the pathname itself is already that prefix.
 */
export function pathBase(pathname: string, matchedId: string | undefined): string {
  const withSlash = pathname.endsWith('/') ? pathname : `${pathname}/`
  if (matchedId === undefined) return withSlash
  const suffix = `${matchedId}/`
  return withSlash.endsWith(suffix) ? withSlash.slice(0, -suffix.length) : withSlash
}

/**
 * The URL for one component page: `<base><id>/` plus any remaining query.
 *
 * Absolute by construction (the base carries the leading slash), because the
 * caller writes it with `replaceState` — and a relative `?query` there
 * resolves against whatever directory the URL already has, which is how a path
 * and a query come to name different components.
 *
 * An empty id degrades to the base rather than emitting `//`: a catalog with
 * no components is a real state, and it should land on the site root.
 */
export function componentUrl(base: string, id: string, query: string): string {
  const path = id ? `${base}${encodeURIComponent(id)}/` : base
  return query ? `${path}?${query}` : path
}

/**
 * Can this value travel in a link? Functions cannot; neither can a vnode
 * (an object whose `type` is a function or symbol) — `JSON.stringify` would
 * drop the one silently and serialise the other as its plain-object innards.
 * An authored scenario may carry both (a render-prop child, an `h()` tree),
 * and they belong to the config, not the URL.
 */
export function isLinkable(value: unknown): boolean {
  if (typeof value === 'function' || typeof value === 'symbol') return false
  if (typeof value !== 'object' || value === null) return true
  if (Array.isArray(value)) return value.every(isLinkable)
  // A vnode as `h()` builds it — `{ type, props, children[] }`, the type may
  // be a tag string. Kept local rather than imported from core: the UI bundle
  // is served to the browser and pulls nothing from the node-side core.
  const v = value as { type?: unknown; props?: unknown; children?: unknown }
  if (
    (typeof v.type === 'string' || typeof v.type === 'function' || typeof v.type === 'symbol') &&
    typeof v.props === 'object' &&
    Array.isArray(v.children)
  ) {
    return false
  }
  return Object.values(value).every(isLinkable)
}

/**
 * The keys of `current` that DIFFER from `base` — the edits worth carrying in
 * a link. Absent `current` means no edits. Compared by JSON form, so an
 * array or object arg counts as unchanged when it is structurally the same.
 */
export function editedArgs(
  current: Record<string, unknown> | undefined,
  base: Record<string, unknown>,
): Record<string, unknown> {
  if (!current) return {}
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(current)) {
    if (!isLinkable(value)) continue
    if (key in base && JSON.stringify(base[key]) === JSON.stringify(value)) continue
    out[key] = value
  }
  return out
}

/**
 * The state a link does NOT need to state — what the workbench opens on anyway.
 *
 * Every key is optional: an absent default falls back to the SHIPPED one
 * (`SHIPPED_DEFAULTS`). The model passes the per-project ones it resolved
 * (the first viewport / background / locale / role preset), because a project
 * whose first viewport is `kiosk` opens on `kiosk`, and writing `?viewport=kiosk`
 * into every one of its links would say nothing.
 */
export type UrlDefaults = Omit<UrlState, 'c' | 'args'>

/** The workbench's own opening state, independent of any project preset. */
export const SHIPPED_DEFAULTS: Required<UrlDefaults> = {
  p: 'controls',
  viewport: 'full',
  background: 'theme',
  locale: 'en',
  brand: 'ember',
  dark: true,
  view: 'canvas',
  pseudo: '',
  query: 'success',
  role: 'anonymous',
}

/**
 * Encode state into a query string (no leading `?`).
 *
 * Only NON-default values are written. A link used to carry
 * `?p=controls&brand=ember&role=anonymous` on every component — three
 * parameters restating what opening the workbench does anyway, which made the
 * one parameter that mattered (`?args=…`) hard to spot in a pasted URL.
 */
export function serializeUrlState(state: UrlState, defaults: UrlDefaults = {}): string {
  const d = { ...SHIPPED_DEFAULTS, ...defaults }
  const params = new URLSearchParams()
  const put = (key: keyof UrlDefaults, value: string | undefined) => {
    if (value && value !== d[key]) params.set(key, value)
  }
  if (state.c) params.set('c', state.c)
  put('p', state.p)
  put('viewport', state.viewport)
  put('background', state.background)
  put('locale', state.locale)
  put('brand', state.brand)
  // `dark` is a boolean with no empty form, so it is compared, not truth-tested.
  if (state.dark !== undefined && state.dark !== d.dark) params.set('dark', state.dark ? '1' : '0')
  put('view', state.view)
  put('pseudo', state.pseudo)
  put('query', state.query)
  put('role', state.role)
  if (state.args && Object.keys(state.args).length > 0) {
    params.set(ARGS_KEY, JSON.stringify(state.args))
  }
  return params.toString()
}

/**
 * Decode a query string.
 *
 * Every field is optional and independently recoverable: a link written by a
 * newer Atlas, or hand-edited, must degrade to "the parts I understood" rather
 * than being discarded whole. A user who mangles one parameter should not lose
 * the component selection too.
 */
export function parseUrlState(query: string): UrlState {
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query)
  const state: UrlState = {}

  const c = params.get('c')
  if (c) state.c = c
  const p = params.get('p')
  if (p) state.p = p
  const viewport = params.get('viewport')
  if (viewport) state.viewport = viewport
  const background = params.get('background')
  if (background) state.background = background
  const locale = params.get('locale')
  if (locale) state.locale = locale
  const brand = params.get('brand')
  if (brand) state.brand = brand
  const dark = params.get('dark')
  if (dark !== null) state.dark = dark !== '0'
  const view = params.get('view')
  if (view) state.view = view
  const pseudo = params.get('pseudo')
  if (pseudo) state.pseudo = pseudo
  const queryState = params.get('query')
  if (queryState) state.query = queryState
  const role = params.get('role')
  if (role) state.role = role

  const args = params.get(ARGS_KEY)
  if (args) {
    try {
      const parsed = JSON.parse(args) as unknown
      // Only a plain object is usable as control values. An array or a scalar
      // would spread into nonsense, and a link is untrusted input — it may have
      // been edited by hand or truncated by a chat client.
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        state.args = parsed as Record<string, unknown>
      }
    } catch {
      // Malformed args lose the args, not the whole link.
    }
  }
  return state
}

/**
 * Should the URL be rewritten?
 *
 * Compared by serialised form rather than by field, so an unchanged view never
 * pushes a history entry — otherwise the back button would walk through every
 * keystroke in a text control.
 */
export function urlStateChanged(a: UrlState, b: UrlState, defaults: UrlDefaults = {}): boolean {
  return serializeUrlState(a, defaults) !== serializeUrlState(b, defaults)
}
