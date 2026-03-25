import { effect, onCleanup, signal } from "@pyreon/reactivity"
import { inferSerializer } from "./serializers"
import type { Serializer, UrlStateOptions, UrlStateSignal } from "./types"
import { _isBrowser, getParam, getParamAll, setParamRepeated, setParams } from "./url"

// ─── Single-param overload ──────────────────────────────────────────────────

/**
 * Bind a single URL search parameter to a reactive signal.
 *
 * @example
 * ```ts
 * const page = useUrlState("page", 1)
 * page()        // read reactively (number)
 * page.set(2)   // updates signal + URL
 * page.reset()  // back to 1
 * page.remove() // removes ?page entirely
 * ```
 */
export function useUrlState<T>(
  key: string,
  defaultValue: T,
  options?: UrlStateOptions<T>,
): UrlStateSignal<T>

// ─── Schema overload ────────────────────────────────────────────────────────

/**
 * Bind multiple URL search parameters at once via a schema object.
 *
 * @example
 * ```ts
 * const { page, q } = useUrlState({ page: 1, q: "" })
 * page()       // number
 * q.set("hi") // updates ?q=hi
 * ```
 */
export function useUrlState<T extends Record<string, unknown>>(
  schema: T,
  options?: UrlStateOptions,
): { [K in keyof T]: UrlStateSignal<T[K]> }

// ─── Implementation ─────────────────────────────────────────────────────────

export function useUrlState<T>(
  keyOrSchema: string | Record<string, unknown>,
  defaultOrOptions?: T | UrlStateOptions,
  maybeOptions?: UrlStateOptions<T>,
): UrlStateSignal<T> | Record<string, UrlStateSignal<unknown>> {
  // Schema mode
  if (typeof keyOrSchema === "object") {
    const schema = keyOrSchema as Record<string, unknown>
    const opts = defaultOrOptions as UrlStateOptions | undefined
    const result: Record<string, UrlStateSignal<unknown>> = {}

    for (const key of Object.keys(schema)) {
      result[key] = createUrlSignal(key, schema[key], opts)
    }

    return result
  }

  // Single-param mode
  const key = keyOrSchema
  const defaultValue = defaultOrOptions as T
  const options = maybeOptions
  return createUrlSignal(key, defaultValue, options)
}

// ─── Core factory ───────────────────────────────────────────────────────────

function createUrlSignal<T>(
  key: string,
  defaultValue: T,
  options?: UrlStateOptions<T>,
): UrlStateSignal<T> {
  const replace = options?.replace !== false
  const debounceMs = options?.debounce ?? 0
  const arrayFormat = options?.arrayFormat ?? "comma"
  const isArray = Array.isArray(defaultValue)
  const isRepeat = isArray && arrayFormat === "repeat"

  const { serialize, deserialize }: Serializer<T> =
    options?.serialize && options?.deserialize
      ? { serialize: options.serialize, deserialize: options.deserialize }
      : inferSerializer(defaultValue, arrayFormat)

  // Read initial value from URL (falls back to default when missing or in SSR)
  let initial: T
  if (isRepeat) {
    const values = getParamAll(key)
    initial = values.length > 0 ? (values as T) : defaultValue
  } else {
    const raw = getParam(key)
    initial = raw !== null ? deserialize(raw) : defaultValue
  }

  const state = signal<T>(initial)

  // Pending debounce timer
  let timer: ReturnType<typeof setTimeout> | undefined

  // Write URL when signal changes
  const writeUrl = (value: T) => {
    if (isRepeat) {
      const arr = value as string[]
      const defaultArr = defaultValue as string[]
      // Remove param when value equals default to keep URLs clean
      if (arr.length === defaultArr.length && arr.every((v, i) => v === defaultArr[i])) {
        setParamRepeated(key, null, replace)
      } else {
        setParamRepeated(key, arr, replace)
      }
      return
    }

    const serialized = serialize(value)
    const defaultSerialized = serialize(defaultValue)

    // Remove param when value equals default to keep URLs clean
    if (serialized === defaultSerialized) {
      setParams({ [key]: null }, replace)
    } else {
      setParams({ [key]: serialized }, replace)
    }
  }

  /** Force-remove the param from URL regardless of value. */
  const removeFromUrl = () => {
    if (isRepeat) {
      setParamRepeated(key, null, replace)
    } else {
      setParams({ [key]: null }, replace)
    }
  }

  const scheduleWrite = (value: T) => {
    if (debounceMs <= 0) {
      writeUrl(value)
      return
    }
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      writeUrl(value)
    }, debounceMs)
  }

  // Listen for popstate (back/forward navigation)
  if (_isBrowser) {
    const onPopState = () => {
      let value: T
      if (isRepeat) {
        const values = getParamAll(key)
        value = values.length > 0 ? (values as T) : defaultValue
      } else {
        const current = getParam(key)
        value = current !== null ? deserialize(current) : defaultValue
      }
      state.set(value)
      options?.onChange?.(value)
    }

    effect(() => {
      window.addEventListener("popstate", onPopState)
      onCleanup(() => {
        window.removeEventListener("popstate", onPopState)
        if (timer !== undefined) clearTimeout(timer)
      })
    })
  }

  // Build the signal-like accessor
  const accessor = (() => state()) as UrlStateSignal<T>

  accessor.set = (value: T) => {
    state.set(value)
    scheduleWrite(value)
  }

  accessor.reset = () => {
    state.set(defaultValue)
    scheduleWrite(defaultValue)
  }

  accessor.remove = () => {
    state.set(defaultValue)
    if (timer !== undefined) clearTimeout(timer)
    removeFromUrl()
  }

  return accessor
}
