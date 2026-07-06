/**
 * `screen` — the whole-document query surface, bound to `document.body`.
 * Mirrors `@testing-library/react`'s `screen`: when a test renders into the
 * default base element, `screen.getByText(...)` finds it without threading
 * the `render()` result through.
 *
 * Bound lazily per access so it always queries the live `document.body`
 * (which the DOM environment may not have created at module-eval time).
 */
import { type BoundQueries, bindQueries } from './queries'

export const screen: BoundQueries = new Proxy({} as BoundQueries, {
  get(_target, prop: keyof BoundQueries) {
    return bindQueries(document.body)[prop]
  },
})
