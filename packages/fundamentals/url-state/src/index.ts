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
 *
 * // Schema mode — multiple params at once
 * const { q, sort } = useUrlState({ q: '', sort: 'name' })
 * q.set('hello')  // ?q=hello&sort=name
 * ```
 */

export { useUrlState } from "./use-url-state"

// ─── Types ───────────────────────────────────────────────────────────────────

export type { Serializer, UrlStateOptions, UrlStateSignal } from "./types"
