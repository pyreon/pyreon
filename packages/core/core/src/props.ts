// Prop utilities for component authoring.

/**
 * Split props into two groups: keys you want and the rest.
 * Unlike destructuring, this preserves reactivity (getters on the original object).
 *
 * @example
 * const [own, html] = splitProps(props, ["label", "icon"])
 * return <button {...html}><Icon name={own.icon} /> {own.label}</button>
 */
export function splitProps<T extends object, K extends (keyof T)[]>(
  props: T,
  keys: K,
): [Pick<T, K[number]>, Omit<T, K[number]>] {
  const picked = {} as Pick<T, K[number]>
  const rest = {} as Omit<T, K[number]>
  const keySet = new Set<string | symbol>(keys as (string | symbol)[])

  // Reflect.ownKeys includes symbol-keyed properties; Object.keys drops them
  // silently. Without this, symbol-keyed props (e.g. branded reactive props
  // under Symbol.for('pyreon.reactiveProp')) would vanish from both picked
  // and rest.
  for (const key of Reflect.ownKeys(props)) {
    const desc = Object.getOwnPropertyDescriptor(props, key)
    if (!desc) continue
    // Force configurable: true when copying to a fresh object. Source descriptors
    // may be non-configurable (default when created with `Object.defineProperty`
    // and the caller omitted `configurable`). If we preserved that, any later
    // `Object.defineProperty` on the same key — including subsequent splitProps
    // post-processing or test mocks — would throw "Cannot redefine property".
    const safe = { ...desc, configurable: true }
    if (keySet.has(key)) {
      Object.defineProperty(picked, key, safe)
    } else {
      Object.defineProperty(rest, key, safe)
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
    Object.defineProperty(result, key, { ...desc, configurable: true })
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
    // Force configurable: true — source getters may have been defined via
    // `Object.defineProperty` without an explicit configurable flag (which
    // defaults to false). Without this, a later source in the same mergeProps
    // call that overrides the same key would crash with TypeError:
    // "Cannot redefine property".
    Object.defineProperty(result, key, { ...desc, configurable: true })
  } else if (existing?.get) {
    mergeStaticWithGetter(result, key, desc, existing.get)
  } else if (desc.value !== undefined || !existing) {
    // Both static — later value wins if defined
    Object.defineProperty(result, key, { ...desc, configurable: true })
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
    // See splitProps for why this uses Reflect.ownKeys instead of Object.keys.
    for (const key of Reflect.ownKeys(source)) {
      const desc = Object.getOwnPropertyDescriptor(source, key)
      if (!desc) continue
      mergeProperty(result, key as string, desc)
    }
  }
  return result
}

/**
 * Copy a props object, dropping keys whose DATA value is `undefined` while
 * preserving every getter-shaped (reactive) prop verbatim.
 *
 * This is the descriptor-aware filter every prop-forwarding HOC needs BEFORE
 * merging consumer props over defaults: an `undefined` value from the consumer
 * must not shadow a default, but a compiler-emitted reactive prop
 * (`_rp(() => signal())` that {@link makeReactiveProps} converts to a property
 * getter) must survive with its subscription intact. A plain
 * `result[key] = props[key]` value-copy would FIRE each getter at HOC-setup
 * time (outside any tracking scope), capture the resolved value, and store it
 * as a static data property — collapsing the live signal to a one-shot
 * snapshot so the downstream `applyProp` / `_bind` has nothing to track.
 *
 * Getter descriptors are kept as-is (we can't peek the value without firing
 * the getter, so the `undefined` filter doesn't apply to them). Data
 * descriptors are dropped only when their value is exactly `undefined` —
 * `null`, `0`, `''`, `false` are kept.
 *
 * Lives here, next to {@link mergeProps} / {@link splitProps} / {@link makeReactiveProps},
 * because filtering this object is an operation on `@pyreon/core`'s own
 * reactive-prop encoding — `@pyreon/attrs` and `@pyreon/rocketstyle` both
 * hand-rolled it before, and one copy silently shipped the value-copy bug.
 *
 * @example
 * const filtered = removeUndefinedProps(props) // undefined keys gone, getters live
 * const merged = mergeProps(defaults, filtered)
 */
type RemoveUndefinedProps = <T extends Record<string, any>>(
  props: T,
) => { [I in keyof T as T[I] extends undefined ? never : I]: T[I] }

export const removeUndefinedProps = (<T extends Record<string, any>>(props: T) => {
  const result: Record<string, unknown> = {}
  const descriptors = Object.getOwnPropertyDescriptors(props)
  for (const key of Object.keys(descriptors)) {
    const d = descriptors[key] as PropertyDescriptor
    // Keep getter-shaped descriptors verbatim (reactive props). For data
    // descriptors, drop `value === undefined` so they don't shadow defaults.
    if (d.get || d.value !== undefined) {
      Object.defineProperty(result, key, d)
    }
  }
  return result
}) as RemoveUndefinedProps

/**
 * Brand symbol for compiler-emitted reactive prop wrappers.
 * Distinguishes `() => expr` wrappers from user-written accessor props
 * (like Show's `when={() => condition()}`).
 */
export const REACTIVE_PROP = Symbol.for('pyreon.reactiveProp')

/** Symbol to access the underlying props signal for updates. */
export const PROPS_SIGNAL = Symbol.for('pyreon.propsSignal')

/**
 * Create a branded reactive prop wrapper.
 * Called by the compiler for component prop expressions containing signal reads.
 */
export function _rp<T>(fn: () => T): () => T {
  ;(fn as any)[REACTIVE_PROP] = true
  return fn
}

/**
 * Wrap a JSX spread source so its getter-shaped reactive props survive
 * the JS-level object spread that esbuild's automatic JSX runtime emits
 * for `<Comp {...source}>`.
 *
 * Without this wrapper, esbuild compiles `<Comp {...source}>` to
 * `jsx(Comp, { ...source })` — and JS spread fires every getter on
 * `source`, storing the resolved values as plain data properties. Any
 * compiler-emitted reactive prop (`_rp(() => signal())` converted to a
 * getter by `makeReactiveProps`) on `source` is collapsed to its
 * initial value before the receiving component ever sees it.
 *
 * `_wrapSpread(source)` walks `source`'s own keys via `Reflect.ownKeys`
 * (no getter firing) and returns a new object whose values are
 * `_rp`-branded thunks `() => source[key]`. When `{ ..._wrapSpread(s) }`
 * is spread by esbuild, the thunks are stored as plain data property
 * values (no getters to fire), then `makeReactiveProps` in `mount.ts`
 * converts the brands back into getters that lazily read from the
 * original `source` — preserving the reactive subscription end-to-end.
 *
 * Fast path: when `source` has no getter descriptors, return the
 * source object unchanged. JS spread will work correctly in that case
 * because there's nothing reactive to preserve. Saves N thunk
 * allocations per component render in the 99% case.
 *
 * Emitted by the compiler — not generally meant for hand-written code.
 */
export function _wrapSpread(
  source: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null | undefined {
  if (!source || typeof source !== 'object') return source
  const descriptors = Object.getOwnPropertyDescriptors(source)
  let hasGetter = false
  for (const k in descriptors) {
    if (descriptors[k]!.get) {
      hasGetter = true
      break
    }
  }
  if (!hasGetter) return source

  const result: Record<string, unknown> = {}
  // Reflect.ownKeys covers symbol keys too — REACTIVE_PROP brands and
  // other framework symbols must round-trip through the wrap.
  for (const key of Reflect.ownKeys(source)) {
    const desc = descriptors[key as string]
    if (!desc) continue
    if (desc.get) {
      const fn: () => unknown = () => source[key as string]
      ;(fn as unknown as Record<symbol, boolean>)[REACTIVE_PROP] = true
      result[key as string] = fn
    } else {
      // Static data property — copy through as-is.
      result[key as string] = desc.value
    }
  }
  return result
}

/**
 * Convert compiler-emitted `_rp(() => expr)` prop values into getter properties.
 *
 * Only converts functions branded with REACTIVE_PROP — user-written accessor
 * props (like Show's when, For's each) are left as-is.
 *
 * Returns the same object if no reactive props found (fast path).
 */
export function makeReactiveProps(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  // Fast path: scan for any REACTIVE_PROP-branded function first.
  // If none found, return raw immediately — no object allocation, no property copying.
  // This saves ~90 object allocations + ~450 property copies per page load
  // for components with all-static props (buttons, icons, layout, etc.).
  const keys = Object.keys(raw)
  let hasAny = false
  for (let i = 0; i < keys.length; i++) {
    const val = raw[keys[i]!]
    if (typeof val === 'function' && (val as any)[REACTIVE_PROP]) {
      hasAny = true
      break
    }
  }
  if (!hasAny) return raw

  // At least one reactive prop exists — build the getter-backed object.
  const result: Record<string, unknown> = {}
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!
    const val = raw[key]
    if (typeof val === 'function' && (val as any)[REACTIVE_PROP]) {
      Object.defineProperty(result, key, {
        get: val as () => unknown,
        enumerable: true,
        configurable: true,
      })
    } else {
      result[key] = val
    }
  }

  return result
}

// ─── Unique ID ───────────────────────────────────────────────────────────────

// Plain module-scope counter. The duplicate-instance bug class is now
// prevented at the bundler layer + detected at the runtime layer — see
// `.claude/plans/jaunty-herding-kazoo.md`.
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
