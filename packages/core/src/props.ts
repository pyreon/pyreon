// Prop utilities for component authoring.

/**
 * Split props into two groups: keys you want and the rest.
 * Unlike destructuring, this preserves reactivity (getters on the original object).
 *
 * @example
 * const [own, html] = splitProps(props, ["label", "icon"])
 * return <button {...html}><Icon name={own.icon} /> {own.label}</button>
 */
export function splitProps<T extends Record<string, unknown>, K extends (keyof T)[]>(
  props: T,
  keys: K,
): [Pick<T, K[number]>, Omit<T, K[number]>] {
  const picked = {} as Pick<T, K[number]>
  const rest = {} as Omit<T, K[number]>
  const keySet = new Set<string | symbol>(keys as (string | symbol)[])

  for (const key of Object.keys(props)) {
    const desc = Object.getOwnPropertyDescriptor(props, key)
    if (!desc) continue
    if (keySet.has(key)) {
      Object.defineProperty(picked, key, desc)
    } else {
      Object.defineProperty(rest, key, desc)
    }
  }

  return [picked, rest]
}

/**
 * Merge default values with component props. Defaults are used when
 * the prop is `undefined`. Preserves getter reactivity.
 *
 * @example
 * const merged = mergeProps({ size: "md", variant: "primary" }, props)
 * // merged.size is reactive — falls back to "md" when props.size is undefined
 */
export function mergeProps<T extends Record<string, unknown>>(...sources: T[]): T {
  const result = {} as T
  for (const source of sources) {
    for (const key of Object.keys(source)) {
      const desc = Object.getOwnPropertyDescriptor(source, key)
      if (!desc) continue
      // If the source has a getter, wrap it to check if the value is undefined
      // and fall back to the previously defined value
      const existing = Object.getOwnPropertyDescriptor(result, key)
      if (desc.get && existing) {
        const prevGet = existing.get ?? (() => existing.value)
        const nextGet = desc.get
        Object.defineProperty(result, key, {
          get: () => {
            const v = nextGet()
            return v !== undefined ? v : prevGet()
          },
          enumerable: true,
          configurable: true,
        })
      } else if (desc.get) {
        Object.defineProperty(result, key, desc)
      } else if (existing?.get) {
        // New source has a static value, previous had a getter
        const prevGet = existing.get
        const staticVal = desc.value
        if (staticVal !== undefined) {
          Object.defineProperty(result, key, desc)
        } else {
          Object.defineProperty(result, key, {
            get: prevGet,
            enumerable: true,
            configurable: true,
          })
        }
      } else {
        // Both static — later value wins if defined
        if (desc.value !== undefined || !existing) {
          Object.defineProperty(result, key, desc)
        }
      }
    }
  }
  return result
}

// ─── Unique ID ───────────────────────────────────────────────────────────────

let _idCounter = 0

/**
 * Generate a unique ID string for accessibility attributes (htmlFor, aria-describedby, etc.).
 * SSR-safe: uses a deterministic counter that resets per request context.
 *
 * @example
 * const id = createUniqueId()
 * return <>
 *   <label for={id}>Name</label>
 *   <input id={id} />
 * </>
 */
export function createUniqueId(): string {
  return `pyreon-${++_idCounter}`
}

/** Reset the ID counter (called by SSR per-request). */
export function _resetIdCounter(): void {
  _idCounter = 0
}
