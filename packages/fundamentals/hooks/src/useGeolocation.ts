// useGeolocation — device position, shared across web / iOS / Android.
//
// The native half already existed: PMTC lowers `useGeolocation()` to
// `PyreonGeolocation` on both targets (CLLocationManager on iOS,
// FusedLocationProvider on Android), and the compiler's lowered-hook allowlist
// has listed it since Phase 5. The WEB half did not exist at all — no
// implementation, no export, no type. So `import { useGeolocation } from
// '@pyreon/hooks'` did not resolve, and an app using it could not build for
// web.
//
// That made it native-only in practice while being presented alongside hooks
// that are genuinely shared (`useHaptics`, `useShare`, `useClipboard`,
// `useAppState` all ship web implementations). `useMap`, `usePush` and
// `usePayments` are still in that state — tracked separately; this closes the
// one with a straightforward browser equivalent.
//
// The returned SHAPE is what makes it shared code, and it is not arbitrary:
// PMTC reads `geo.latitude` / `geo.start()` as members on the native
// container, so the web object exposes exactly those names. The precedent is
// `useOnline`, where the compiler maps the web-idiomatic read onto the native
// container field — verified by emitting both shapes and checking the Swift
// and Kotlin output reads the right field.
//
// Reactive fields are GETTERS over signals, so `<Text>{geo.latitude}</Text>`
// tracks on web the same way the `@Observable` / `MutableState` container does
// on native. Returning bare signals instead would force `geo.latitude()` on
// web and diverge from the native member read — the shape mismatch that made
// `@pyreon/form` non-shared.
//
// HONEST SCOPE: the reactive READS are shared on all three targets, but
// `start()` is web + iOS only. Kotlin's `PyreonGeolocation.start` takes a host
// closure (no default location transport) while Swift's is 0-arg, so
// `geo.start()` does not compile on Android. That asymmetry predates this hook
// and is tracked for `usePush` / `usePayments` too; this file does not paper
// over it.
//
// `latitude` is `number | null`, matching the native `Double?`. Rendering a
// null reads as empty on all three targets (the native emit wraps the optional
// interpolation; a raw one would print `Optional(37.3349)` on Swift).

import { batch, onCleanup, signal } from '@pyreon/reactivity'

/** Options for {@link useGeolocation}. Mirrors `PositionOptions`. */
export interface UseGeolocationOptions {
  /** Request the best available accuracy (costs battery). Default `false`. */
  readonly enableHighAccuracy?: boolean
  /** Milliseconds to wait for a fix before erroring. Default `10_000`. */
  readonly timeout?: number
  /** Accept a cached fix up to this many ms old. Default `0` (always fresh). */
  readonly maximumAge?: number
}

/**
 * Reactive position container. Field names match the native
 * `PyreonGeolocation` surface so one source works on all three targets.
 */
export interface UseGeolocationResult {
  /** Latest latitude in degrees, or `null` before the first fix. */
  readonly latitude: number | null
  /** Latest longitude in degrees, or `null` before the first fix. */
  readonly longitude: number | null
  /** Horizontal accuracy in metres for the latest fix, or `null`. */
  readonly accuracy: number | null
  /** Last error message, or `null`. Permission denial lands here. */
  readonly error: string | null
  /** True between `start()` and `stop()`. */
  readonly isTracking: boolean
  /**
   * Begin watching position. Idempotent.
   *
   * PLATFORM ASYMMETRY — web + iOS only today. The Kotlin runtime's
   * `PyreonGeolocation.start` takes a host closure
   * (`start(register: (GeolocationHandlers) -> (() -> Unit))`) because it has
   * no default location transport, while Swift's is 0-arg. So `geo.start()`
   * compiles on web and iOS and does NOT compile on Android — the same
   * OkHttp-for-WebSocket asymmetry noted for `usePush` / `usePayments`.
   *
   * The reactive READS below (`latitude` / `longitude` / `accuracy`) are
   * genuinely shared on all three targets; only starting the watch is not.
   * Until the Kotlin side grows a default transport, drive Android from host
   * code or keep the call in a `<NativeIOS>` / `<Web>` branch.
   */
  start(): void
  /** Stop watching. Idempotent; also runs automatically on unmount. */
  stop(): void
}

/**
 * Watch the device's position.
 *
 * @example
 * ```tsx
 * const geo = useGeolocation()
 * return (
 *   <Stack>
 *     <Text>{geo.latitude}</Text>
 *     <Button onPress={() => geo.start()}>Locate</Button>
 *   </Stack>
 * )
 * ```
 */
export function useGeolocation(options: UseGeolocationOptions = {}): UseGeolocationResult {
  const latitude = signal<number | null>(null)
  const longitude = signal<number | null>(null)
  const accuracy = signal<number | null>(null)
  const error = signal<string | null>(null)
  const tracking = signal(false)

  let watchId: number | undefined

  const stop = (): void => {
    // Idempotent: `stop()` before `start()`, or twice, must be a no-op —
    // onCleanup calls it unconditionally on unmount.
    if (watchId === undefined) return
    // The guard is redundant by construction — watchId is only ever set inside
    // start(), which bails without a navigator — but that reasoning lives
    // across two functions and is not AST-traceable, so `no-window-in-ssr`
    // (rightly) cannot see it. An explicit typeof check states the SSR
    // contract at the access site instead of relying on an invariant a reader
    // has to reconstruct.
    if (typeof navigator === 'undefined' || navigator.geolocation === undefined) {
      watchId = undefined
      tracking.set(false)
      return
    }
    navigator.geolocation.clearWatch(watchId)
    watchId = undefined
    tracking.set(false)
  }

  const start = (): void => {
    if (watchId !== undefined) return
    if (typeof navigator === 'undefined' || navigator.geolocation === undefined) {
      // No navigator (SSR) or no Geolocation API (rare, non-secure origin).
      // Surface it rather than silently never producing a fix — the native
      // targets report a permission failure the same way.
      error.set('[Pyreon] useGeolocation: Geolocation is unavailable in this environment')
      return
    }
    batch(() => {
      tracking.set(true)
      error.set(null)
    })
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        // ONE fix must be ONE reactive update. Four bare `.set()` calls would
        // fire up to four passes per fix, and a consumer reading lat+lng could
        // observe a TORN pair — the new latitude against the previous
        // longitude, i.e. a coordinate that was never real.
        batch(() => {
          latitude.set(pos.coords.latitude)
          longitude.set(pos.coords.longitude)
          accuracy.set(pos.coords.accuracy)
          error.set(null)
        })
      },
      (err) => {
        // A denial ends the watch on every browser, so reflect that in
        // `isTracking` rather than leaving it stuck true.
        batch(() => {
          error.set(`[Pyreon] useGeolocation: ${err.message}`)
          tracking.set(false)
        })
        watchId = undefined
      },
      {
        enableHighAccuracy: options.enableHighAccuracy ?? false,
        timeout: options.timeout ?? 10_000,
        maximumAge: options.maximumAge ?? 0,
      },
    )
  }

  // A watch left running after unmount keeps the GPS active and holds the
  // callback's closure alive — a battery drain the user cannot see.
  onCleanup(stop)

  return {
    get latitude() {
      return latitude()
    },
    get longitude() {
      return longitude()
    },
    get accuracy() {
      return accuracy()
    },
    get error() {
      return error()
    },
    get isTracking() {
      return tracking()
    },
    start,
    stop,
  }
}
