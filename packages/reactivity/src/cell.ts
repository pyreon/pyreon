/**
 * Lightweight reactive cell — class-based alternative to signal().
 *
 * - 1 object allocation vs signal()'s 6 closures
 * - Same API surface: peek(), set(), update(), subscribe(), listen()
 * - NOT callable as a getter (no effect tracking) — use for fixed subscriptions
 * - Methods on prototype, shared across all instances
 * - Single-listener fast path: no Set allocated when ≤1 subscriber
 *
 * Use when you need reactive state but don't need automatic effect dependency tracking.
 * Ideal for list item labels in keyed reconcilers where subscribe() is used directly.
 */
export class Cell<T> {
  /** @internal */ _v: T
  /** @internal */ _l: (() => void) | null = null // single-listener fast path
  /** @internal */ _s: Set<() => void> | null = null // multi-listener fallback

  constructor(value: T) {
    this._v = value
  }

  peek(): T {
    return this._v
  }

  set(value: T): void {
    if (Object.is(this._v, value)) return
    this._v = value
    if (this._l) this._l()
    else if (this._s) for (const fn of this._s) fn()
  }

  update(fn: (current: T) => T): void {
    this.set(fn(this._v))
  }

  /**
   * Fire-and-forget subscription — no unsubscribe returned.
   * Use when the listener's lifetime matches the cell's (e.g., list rows).
   * Saves 1 closure allocation per call vs subscribe().
   */
  listen(listener: () => void): void {
    if (!this._l && !this._s) {
      this._l = listener
    } else {
      // Promote to Set
      if (!this._s) {
        this._s = new Set()
        if (this._l) {
          this._s.add(this._l)
          this._l = null
        }
      }
      this._s.add(listener)
    }
  }

  subscribe(listener: () => void): () => void {
    this.listen(listener)
    if (this._l === listener) {
      return () => {
        if (this._l === listener) this._l = null
      }
    }
    return () => this._s?.delete(listener)
  }
}

export function cell<T>(value: T): Cell<T> {
  return new Cell(value)
}
