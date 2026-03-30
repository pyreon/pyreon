/**
 * @pyreon/url-state — Reactive URL search-param state for Pyreon.
 *
 * Signal-backed, type-coerced, SSR-safe URL state management. Each search
 * parameter is a reactive signal that syncs with the browser URL.
 *
 * @example
 * ```ts
 * import { useUrlState } from '@pyreon/url-state'
 *
 * // Single parameter — type inferred from default
 * const page = useUrlState('page', 1)
 * page()        // read reactively (number)
 * page.set(2)   // updates signal + URL (?page=2)
 * page.reset()  // back to default (removes ?page)
 * page.remove() // removes ?page entirely
 *
 * // Schema mode — multiple params at once
 * const { q, sort } = useUrlState({ q: '', sort: 'name' })
 * q.set('hello')  // ?q=hello&sort=name
 *
 * // Array with repeated keys
 * const tags = useUrlState('tags', [] as string[], { arrayFormat: 'repeat' })
 * tags.set(['a', 'b'])  // ?tags=a&tags=b
 *
 * // Router integration — uses router.replace() when available
 * import { setUrlRouter } from '@pyreon/url-state'
 * setUrlRouter(router)  // pass your @pyreon/router instance
 * ```
 */

export { setUrlRouter } from './url'
export { useUrlState } from './use-url-state'

// ─── Types ───────────────────────────────────────────────────────────────────

export type { ArrayFormat, Serializer, UrlStateOptions, UrlStateSignal } from './types'
export type { UrlRouter } from './url'
