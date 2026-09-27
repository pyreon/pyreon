import { effect, isClient, onCleanup, signal, untrack } from '@pyreon/reactivity'
import { INVALID, inferElementCodec, inferSerializer } from './serializers'
import { isBatching, subscribeKey, writeRepeatedParam, writeSingleParam } from './sync'
import type { Serializer, UrlStateOptions, UrlStateSignal } from './types'
import { getParam, getParamAll, trackUrlRouter, type UrlRouter } from './url'

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

  // Each half of a custom codec stands on its own: a lone `deserialize` (the
  // common case — parse a date) used to be IGNORED unless `serialize` came
  // with it. The missing half is inferred from the default.
  const inferred = inferSerializer(defaultValue, arrayFormat)
  const { serialize, deserialize }: Serializer<T> = {
    serialize: options?.serialize ?? inferred.serialize,
    deserialize: options?.deserialize ?? inferred.deserialize,
  }

  // Repeat format writes one `?k=` per ELEMENT, so the codec is per element: a
  // custom `serialize` / `deserialize` is applied to each element, otherwise
  // the element type is inferred from the default's first element. (Repeat
  // mode used to return raw strings, ignoring both the element type and any
  // custom deserializer.)
  const elementCodec = inferElementCodec(defaultValue)
  const serializeElement = options?.serialize
    ? (e: unknown) => (options.serialize as (v: unknown) => string)(e)
    : elementCodec.serialize
  const deserializeElement = options?.deserialize
    ? (raw: string) => (options.deserialize as (r: string) => unknown)(raw)
    : elementCodec.deserialize

  // Read the current URL value (falls back to default when missing or in SSR).
  const readFromUrl = (): T => {
    if (isRepeat) {
      const values = getParamAll(key)
      if (values.length === 0) return defaultValue
      try {
        const out: unknown[] = []
        for (const raw of values) {
          const v = deserializeElement(raw)
          if (v === INVALID) return defaultValue
          out.push(v)
        }
        return out as T
      } catch (err) {
        /* v8 ignore next — production arm of a dev gate. */
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[Pyreon] url-state: could not deserialize ?${key} — using the default. ${String(err)}`,
          )
        }
        return defaultValue
      }
    }
    const raw = getParam(key)
    if (raw === null) return defaultValue
    // A URL is UNTRUSTED input — hand-edited, truncated by a chat client,
    // shared from an older version of the app. The inferred object serializer
    // is `JSON.parse`, so `?f={oops` threw out of here at component SETUP and
    // took the page down; a custom `deserialize` can throw on garbage just as
    // easily. Falling back to the default matches what the number serializer
    // already did for `?page=abc`, and keeps the failure to one param.
    try {
      return deserialize(raw)
    } catch (err) {
      // Loud in dev, because the other reason this fires is a serializer that
      // genuinely disagrees with what the app writes — which a silent default
      // would hide for as long as the URL happens to be well-formed.
      /* v8 ignore next — the production arm of a dev gate; unreachable under
         vitest, where NODE_ENV is 'test'. */
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          `[Pyreon] url-state: could not deserialize ?${key}=${raw} — using the default. ${String(err)}`,
        )
      }
      return defaultValue
    }
  }

  const state = signal<T>(readFromUrl())

  // Pending debounce timer
  let timer: ReturnType<typeof setTimeout> | undefined

  // A comparable string for a value, so a re-read can tell whether the URL
  // actually moved. Custom codecs may throw — then treat it as changed.
  const snapshot = (value: T): string | undefined => {
    try {
      return isRepeat
        ? JSON.stringify((value as unknown[]).map(serializeElement))
        : serialize(value)
    } catch {
      return undefined
    }
  }

  // Re-read from the URL and reflect it into the signal + onChange. Runs on
  // popstate (back/forward), after a navigation through the registered
  // router, AND when a SIBLING signal for the same key writes. Only a value
  // that actually differs is reported — a popstate for an unrelated param (or
  // a navigation this signal caused itself) used to fire `onChange` anyway.
  const reRead = () => {
    const value = readFromUrl()
    const next = snapshot(value)
    if (next !== undefined && next === snapshot(state.peek())) return
    state.set(value)
    options?.onChange?.(value)
  }

  // Write URL when signal changes.
  const writeUrl = (value: T) => {
    if (isRepeat) {
      const arr = (value as unknown[]).map(serializeElement)
      const defaultArr = (defaultValue as unknown[]).map(serializeElement)
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

    // Follow navigations made THROUGH the registered router
    // (`router.push('?page=2')`, `<RouterLink>`). Those are `pushState` /
    // `replaceState` calls, which fire no event, so without this the signal
    // stayed stale until the next popstate. Tracks the router REGISTRATION too,
    // so a signal created before `setUrlRouter()` picks the router up.
    // The router this effect last subscribed to. Kept (not the route object —
    // retaining a snapshot for the effect's lifetime is leak class H).
    let subscribedTo: UrlRouter | null = null
    // pyreon-lint-disable-next-line pyreon/no-imperative-effect-on-create
    effect(() => {
      const router = trackUrlRouter()
      if (typeof router?.currentRoute !== 'function') return
      router.currentRoute() // the tracked dependency
      // The subscribing run is not a navigation — the value was just read.
      // Re-reading here raced a write of our own that an async router has
      // not committed yet, and briefly reverted it.
      const first = subscribedTo !== router
      subscribedTo = router
      if (first) return
      // Deferred one microtask: `@pyreon/router` commits the route signal
      // BEFORE it writes the browser URL (same synchronous block), so reading
      // the URL inside this run saw the PREVIOUS query — and clobbered the
      // signal's own fresh write with it.
      let live = true
      onCleanup(() => {
        live = false
      })
      queueMicrotask(() => {
        // A debounced write of our own is still pending: its value is newer
        // than the URL, so a re-read would clobber it.
        if (!live || timer !== undefined) return
        untrack(reRead)
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
