import { SizedMap } from '@pyreon/sized-map'
import type { ResolvedRoute, RouterOptions } from './types'
import { isServer } from '@pyreon/reactivity'

/**
 * Scroll restoration manager.
 *
 * Saves scroll position before each navigation and restores it when
 * navigating back to a previously visited path.
 */
// LRU cap — in SPAs with unbounded URL space (`/user/:id`, query-string variations.
const MAX_SCROLL_POSITIONS = 100

export class ScrollManager {
  // SizedMap in FIFO mode.
  private readonly _positions = new SizedMap<string, number>({
    maxEntries: MAX_SCROLL_POSITIONS,
  })
  private readonly _behavior: RouterOptions['scrollBehavior']

  constructor(behavior: RouterOptions['scrollBehavior'] = 'top') {
    this._behavior = behavior
  }

  /** Call before navigating away — saves current scroll position for `fromPath` */
  save(fromPath: string): void {
    // ScrollManager methods are only invoked from browser navigation paths.
    if (isServer) return
    // SizedMap.set handles both the recency bump (delete + re-set on collision) and.
    this._positions.set(fromPath, window.scrollY)
  }

  /** Call after navigation is committed — applies scroll behavior */
  restore(to: ResolvedRoute, from: ResolvedRoute): void {
    const behavior = (to.meta.scrollBehavior as typeof this._behavior) ?? this._behavior ?? 'top'

    if (typeof behavior === 'function') {
      const saved = this._positions.get(to.path) ?? null
      const result = behavior(to, from, saved)
      this._applyResult(result, to.path)
      return
    }

    this._applyResult(behavior, to.path)
  }

  private _applyResult(result: 'top' | 'restore' | 'none' | number, toPath: string): void {
    if (isServer) return
    // Hash scrolling: if the path contains #, scroll to the element
    const hashIdx = toPath.indexOf('#')
    if (hashIdx >= 0) {
      const id = toPath.slice(hashIdx + 1)
      if (id) {
        // Use requestAnimationFrame to ensure DOM is updated before scrolling
        requestAnimationFrame(() => {
          const el = document.getElementById(id)
          if (el) {
            el.scrollIntoView({ behavior: 'smooth' })
            return
          }
          const namedEl = document.querySelector(`[name="${CSS.escape(id)}"]`)
          if (namedEl) namedEl.scrollIntoView({ behavior: 'smooth' })
        })
        return
      }
    }

    if (result === 'none') return
    if (result === 'top' || result === undefined) {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
      return
    }
    if (result === 'restore') {
      const saved = this._positions.get(toPath) ?? 0
      window.scrollTo({ top: saved, behavior: 'instant' as ScrollBehavior })
      return
    }
    // At this point result must be a number (all string cases handled above)
    window.scrollTo({ top: result as number, behavior: 'instant' as ScrollBehavior })
  }

  getSavedPosition(path: string): number | null {
    return this._positions.get(path) ?? null
  }
}
