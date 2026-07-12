import { effect, isClient, onCleanup, signal } from '@pyreon/reactivity'
import { inferSerializer } from './serializers'
import { isBatching, subscribeKey, writeRepeatedParam, writeSingleParam } from './sync'
import type { Serializer, UrlStateOptions, UrlStateSignal } from './types'
import { getParam, getParamAll } from './url'

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
  if (typeof keyOrSchema === 'object') {
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
  const arrayFormat = options?.arrayFormat ?? 'comma'
  const clearOnDefault = options?.clearOnDefault !== false
  const isArray = Array.isArray(defaultValue)
  const isRepeat = isArray && arrayFormat === 'repeat'

  const { serialize, deserialize }: Serializer<T> =
    options?.serialize && options?.deserialize
      ? { serialize: options.serialize, deserialize: options.deserialize }
      : inferSerializer(defaultValue, arrayFormat)

  // Read the current URL value (falls back to default when missing or in SSR).
  const readFromUrl = (): T => {
    if (isRepeat) {
      const values = getParamAll(key)
      return values.length > 0 ? (values as T) : defaultValue
    }
    const raw = getParam(key)
    return raw !== null ? deserialize(raw) : defaultValue
  }

  const state = signal<T>(readFromUrl())

  // Pending debounce timer
  let timer: ReturnType<typeof setTimeout> | undefined

  // Re-read from the URL and reflect it into the signal + onChange. Runs on
  // popstate (back/forward) AND when a SIBLING signal for the same key writes.
  const reRead = () => {
    const value = readFromUrl()
    state.set(value)
    options?.onChange?.(value)
  }

  // Write URL when signal changes.
  const writeUrl = (value: T) => {
    if (isRepeat) {
      const arr = value as string[]
      const defaultArr = defaultValue as string[]
      // Remove the param when the value equals the default (unless clearOnDefault:false).
      const equalsDefault =
        arr.length === defaultArr.length && arr.every((v, i) => v === defaultArr[i])
      writeRepeatedParam(key, clearOnDefault && equalsDefault ? null : arr, replace, reRead)
      return
    }

    const serialized = serialize(value)
    // Remove the param when the value equals the default (unless clearOnDefault:false).
    if (clearOnDefault && serialized === serialize(defaultValue)) {
      writeSingleParam(key, null, replace, reRead)
    } else {
      writeSingleParam(key, serialized, replace, reRead)
    }
  }

  /** Force-remove the param from URL regardless of value. */
  const removeFromUrl = () => {
    if (isRepeat) {
      writeRepeatedParam(key, null, replace, reRead)
    } else {
      writeSingleParam(key, null, replace, reRead)
    }
  }

  const scheduleWrite = (value: T) => {
    // Inside a batch, writes land synchronously so they coalesce into the
    // single history op — debounce is bypassed. Same for debounce <= 0.
    if (isBatching() || debounceMs <= 0) {
      writeUrl(value)
      return
    }
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      writeUrl(value)
    }, debounceMs)
  }

  // Listen for popstate (back/forward) and cross-hook writes.
  if (isClient) {
    // Why effect() and not onMount() — `useUrlState` is intentionally
    // callable OUTSIDE a component-mount context (modules, stores,
    // route loaders, and tests). `onMount` would silently no-op there,
    // so the popstate listener + cross-hook subscription would never
    // register. `effect()` runs in any context and `onCleanup` ties
    // teardown to whatever effect-scope owns it (component scope when
    // called from a component, root scope otherwise). The static lint
    // rule flags this site by name — the suppression is load-bearing.
    //
    // Bisect-verified: replacing this with `onMount(() => { ...; return cleanup })`
    // breaks url-state tests because they call `useUrlState` directly
    // without a mount tree.
    // pyreon-lint-disable-next-line pyreon/no-imperative-effect-on-create
    effect(() => {
      window.addEventListener('popstate', reRead)
      const unsubscribe = subscribeKey(key, reRead)
      onCleanup(() => {
        window.removeEventListener('popstate', reRead)
        unsubscribe()
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
