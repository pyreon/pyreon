/**
 * Live control values — what lets a control edit UPDATE the preview instead of
 * re-mounting it.
 *
 * The preview used to call `render(vals(), ctx)` inside an accessor that read
 * `vals()`, so every keystroke in a control threw the component away and
 * mounted a new one. That made Reactive coverage structurally useless: every
 * binding only ever ran at mount, so every binding read "never updated" and
 * the bar sat at 0% on real components. It also hid the bug class the panel
 * exists to find — a component that captured a prop once looked fine, because
 * it was rebuilt with the new value.
 *
 * `render` now receives an object with one GETTER per key. Reading `props.label`
 * inside a binding subscribes that binding to `label` alone, through a
 * per-key computed that only notifies when `label`'s value really changed. A
 * key the catalog's `render` reads WHILE rendering (to branch, to compute a
 * value) cannot update in place — that read is not inside any binding — so it
 * is recorded as a REMOUNT key, and the preview re-renders when it changes,
 * exactly as before. Coverage reports those keys honestly: their bindings are
 * rebuilt, not updated.
 *
 * Memory: a store holds one computed per key of ONE component, and is
 * disposed when the preview moves to another component or restarts — the
 * caller (the model) keeps exactly one live store.
 */
import {
  computed,
  type Computed,
  getCurrentScope,
  setCurrentScope,
  untrack,
} from '@pyreon/reactivity'

/**
 * Value equality for control values. `Object.is` first; a fresh array or plain
 * object with the same JSON (a re-derived `vals()` copies them) is the same
 * value — notifying a binding for it would count as an update that never
 * happened, and fabricate coverage.
 */
export function sameArg(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (!isPlain(a) || !isPlain(b)) return false
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    // A cycle or a BigInt: no structural answer, so it is a change.
    return false
  }
}

function isPlain(v: unknown): v is object {
  if (v === null || typeof v !== 'object') return false
  if (Array.isArray(v)) return true
  const proto = Object.getPrototypeOf(v) as unknown
  return proto === Object.prototype || proto === null
}

/**
 * Run `fn` with no current effect scope. The store outlives whichever binding
 * happened to create it (the preview accessor re-runs, and a re-run disposes
 * what was created inside it) — so its computeds must not be adopted by that
 * scope. The store disposes them itself.
 */
export function detached<T>(fn: () => T): T {
  const prev = getCurrentScope()
  setCurrentScope(null)
  try {
    return fn()
  } finally {
    setCurrentScope(prev)
  }
}

export interface LiveArgs {
  /**
   * A fresh props object with one getter per key in `keys`. Reading a key
   * inside a binding subscribes to that key; reading it while `rendering` is
   * on records it as a remount key and does not subscribe.
   */
  props(keys: readonly string[]): Record<string, unknown>
  /** Run the catalog's `render` with render-time reads recorded as remount keys. */
  rendering<T>(fn: () => T): { out: T; keys: string[] }
  /** The per-key computed, created on first use. */
  cell(key: string): Computed<unknown>
  /** Every key whose value changed since the store was created. */
  changed(): ReadonlySet<string>
  /** Each per-key computed, by key. */
  cells(): ReadonlyMap<string, Computed<unknown>>
  dispose(): void
}

export function createLiveArgs(read: () => Record<string, unknown>): LiveArgs {
  const cells = new Map<string, Computed<unknown>>()
  const changed = new Set<string>()
  // `null` outside a render; the set of keys read while one is open.
  let recording: Set<string> | null = null

  const cell = (key: string): Computed<unknown> => {
    let c = cells.get(key)
    if (!c) {
      c = detached(() =>
        computed(() => read()[key], {
          // Eager and value-gated (see `sameArg`). A gate that answers "not
          // equal" is a real edit, so it is also where `changed` learns of it.
          equals: (prev, next) => {
            const same = sameArg(prev, next)
            if (!same) changed.add(key)
            return same
          },
        }),
      )
      cells.set(key, c)
    }
    return c
  }

  return {
    props(keys) {
      const out: Record<string, unknown> = {}
      for (const key of keys) {
        Object.defineProperty(out, key, {
          enumerable: true,
          configurable: true,
          get: () => {
            const c = cell(key)
            if (recording !== null) {
              recording.add(key)
              return untrack(c)
            }
            return c()
          },
        })
      }
      return out
    },
    rendering(fn) {
      const outer = recording
      const keys = new Set<string>()
      recording = keys
      try {
        return { out: fn(), keys: [...keys] }
      } finally {
        recording = outer
      }
    },
    cell,
    changed: () => changed,
    cells: () => cells,
    dispose() {
      for (const c of cells.values()) c.dispose()
      cells.clear()
      changed.clear()
    },
  }
}
