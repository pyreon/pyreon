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

/** Merge a getter-backed source property with an existing getter or value. */
function mergeGetterWithExisting(
  result: Record<string, unknown>,
  key: string,
  desc: PropertyDescriptor,
  existing: PropertyDescriptor,
): void {
  const prevGet = existing.get ?? (() => existing.value)
  const nextGet = desc.get as () => unknown
  Object.defineProperty(result, key, {
    get: () => {
      const v = nextGet()
      return v !== undefined ? v : prevGet()
    },
    enumerable: true,
    configurable: true,
  })
}

/** Merge a static source property when the existing property has a getter. */
function mergeStaticWithGetter(
  result: Record<string, unknown>,
  key: string,
  desc: PropertyDescriptor,
  existingGet: () => unknown,
): void {
  if (desc.value !== undefined) {
    Object.defineProperty(result, key, desc)
  } else {
    Object.defineProperty(result, key, {
      get: existingGet,
      enumerable: true,
      configurable: true,
    })
  }
}

/** Apply a single source property onto the result object, handling getter/static combos. */
function mergeProperty(
  result: Record<string, unknown>,
  key: string,
  desc: PropertyDescriptor,
): void {
  const existing = Object.getOwnPropertyDescriptor(result, key)
  if (desc.get && existing) {
    mergeGetterWithExisting(result, key, desc, existing)
  } else if (desc.get) {
    Object.defineProperty(result, key, desc)
  } else if (existing?.get) {
    mergeStaticWithGetter(result, key, desc, existing.get)
  } else if (desc.value !== undefined || !existing) {
    // Both static — later value wins if defined
    Object.defineProperty(result, key, desc)
  }
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
      mergeProperty(result, key, desc)
    }
  }
  return result
}

/**
 * Brand symbol for compiler-emitted reactive prop wrappers.
 * Distinguishes `() => expr` wrappers from user-written accessor props
 * (like Show's `when={() => condition()}`).
 */
export const REACTIVE_PROP = Symbol.for('pyreon.reactiveProp')

/**
 * Create a branded reactive prop wrapper.
 * Called by the compiler for component prop expressions containing signal reads.
 */
export function _rp<T>(fn: () => T): () => T {
  ;(fn as any)[REACTIVE_PROP] = true
  return fn
}

/**
 * Convert compiler-emitted `_rp(() => expr)` prop values into getter properties.
 *
 * Only converts functions branded with REACTIVE_PROP — user-written accessor
 * props (like Show's when, For's each) are left as-is.
 */
export function makeReactiveProps(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  let hasGetters = false

  for (const key of Object.keys(raw)) {
    const val = raw[key]

    if (typeof val === 'function' && (val as any)[REACTIVE_PROP]) {
      Object.defineProperty(result, key, {
        get: val as () => unknown,
        enumerable: true,
        configurable: true,
      })
      hasGetters = true
    } else {
      result[key] = val
    }
  }

  return hasGetters ? result : raw
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
