import type { ResolvedRoute, RouterOptions } from "./types"

/**
 * Scroll restoration manager.
 *
 * Saves scroll position before each navigation and restores it when
 * navigating back to a previously visited path.
 */
export class ScrollManager {
  private readonly _positions = new Map<string, number>()
  private readonly _behavior: RouterOptions["scrollBehavior"]

  constructor(behavior: RouterOptions["scrollBehavior"] = "top") {
    this._behavior = behavior
  }

  /** Call before navigating away — saves current scroll position for `fromPath` */
  save(fromPath: string): void {
    if (typeof window !== "undefined") {
      this._positions.set(fromPath, window.scrollY)
    }
  }

  /** Call after navigation is committed — applies scroll behavior */
  restore(to: ResolvedRoute, from: ResolvedRoute): void {
    if (typeof window === "undefined") return

    const behavior = to.meta.scrollBehavior ?? this._behavior ?? "top"

    if (typeof behavior === "function") {
      const saved = this._positions.get(to.path) ?? null
      const result = behavior(to, from, saved)
      this._applyResult(result, to.path)
      return
    }

    this._applyResult(behavior, to.path)
  }

  private _applyResult(result: "top" | "restore" | "none" | number, toPath: string): void {
    if (result === "none") return
    if (result === "top" || result === undefined) {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior })
      return
    }
    if (result === "restore") {
      const saved = this._positions.get(toPath) ?? 0
      window.scrollTo({ top: saved, behavior: "instant" as ScrollBehavior })
      return
    }
    if (typeof result === "number") {
      window.scrollTo({ top: result, behavior: "instant" as ScrollBehavior })
    }
  }

  getSavedPosition(path: string): number | null {
    return this._positions.get(path) ?? null
  }
}
