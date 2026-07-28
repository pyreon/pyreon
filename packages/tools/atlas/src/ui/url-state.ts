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

/** Encode state into a query string (no leading `?`). */
export function serializeUrlState(state: UrlState): string {
  const params = new URLSearchParams()
  if (state.c) params.set('c', state.c)
  if (state.p) params.set('p', state.p)
  if (state.viewport && state.viewport !== 'full') params.set('viewport', state.viewport)
  if (state.background && state.background !== 'theme') params.set('background', state.background)
  if (state.locale && state.locale !== 'en') params.set('locale', state.locale)
  if (state.brand) params.set('brand', state.brand)
  // `dark` is written only when FALSE: the workbench defaults to dark, so
  // omitting the common case keeps a shared link readable.
  if (state.dark === false) params.set('dark', '0')
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
export function urlStateChanged(a: UrlState, b: UrlState): boolean {
  return serializeUrlState(a) !== serializeUrlState(b)
}
