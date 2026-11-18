import { isClient, signal } from '@pyreon/reactivity'
import { onHookCleanup } from './lifecycle'

/**
 * Crash-reporter handle. Member names + semantics match the native
 * `PyreonCrashReporter` container (Swift `@Observable`, Kotlin
 * `mutableStateOf`) so ONE shared source reads the same value on web + iOS +
 * Android.
 *
 * Getters over signals, not plain values: a component body runs ONCE, so
 * returning `{ hadCrash: hadCrash() }` would freeze at the mount value. The
 * getters re-read the signal at each access — exactly how the native
 * reactive fields behave (the useAuth pattern).
 */
export interface UseCrashReporterResult {
  /**
   * The PREVIOUS session's crash report as a JSON string (`''` when none) —
   * a {@link CrashReport} object, the same shape on web, iOS and Android.
   */
  readonly lastCrash: string
  /** True once THIS session found a persisted report from the last one. */
  readonly hadCrash: boolean
  /** Manual capture — caught errors, assertion failures. Persists + forwards. */
  recordError(message: string): void
  /** Ring-buffered context attached to the next report (capped at 32). */
  breadcrumb(message: string): void
  /** Acknowledge the rehydrated report: clears state AND the persisted entry. */
  clear(): void
  /**
   * Install the global-error hooks + rehydrate. Idempotent. Auto-called by
   * the native emit on mount; on web call it once (e.g. in `onMount`) — or
   * never, if you only use `recordError`.
   */
  start(): void
}

const KEY = 'pyreon.crash.last'

/**
 * The report every platform persists (and `lastCrash` / the transport
 * receive, JSON-encoded). The shared fields are the same on web, iOS and
 * Android; `build`, `image` and `addresses` are what `pyreon-native
 * symbolicate` needs to turn a native release stack back into source names.
 */
export interface CrashReport {
  platform: 'web' | 'ios' | 'macos' | 'android'
  message: string
  /** Raw stack text — minified/obfuscated in a native release build. */
  stack: string
  /** The breadcrumb ring at capture time (oldest first, at most 32). */
  breadcrumbs: string[]
  /** ISO-8601 capture time. */
  timestamp: string
  /**
   * Native only: which build crashed. `appId` (bundle id / package name),
   * `version` (CFBundleShortVersionString / versionName), `buildNumber`
   * (CFBundleVersion / versionCode); Android adds `mappingId`, the R8
   * `pg_map_id` the minified frames name (`r8-map-id-<id>`), `''` for an
   * unminified build.
   */
  build?: { appId: string; version: string; buildNumber: string; mappingId?: string }
  /**
   * iOS only: the main executable — `uuid` (LC_UUID, equals the dSYM's
   * UUID), `loadAddress` (hex), `arch` — for `atos -l`.
   */
  image?: { name: string; uuid: string; loadAddress: string; arch: string }
  /** iOS only: the raw return addresses (hex), outermost last. */
  addresses?: string[]
}

/**
 * The web half of the cross-platform crash-reporter story. Capture (via
 * `window.onerror` + `unhandledrejection`) + persist (localStorage — web's
 * durable, cross-reload store, the analogue of the native file/Keychain
 * backing) + rehydrate on `start()`. The vendor transport is app-wired via
 * `setCrashTransport` (the native `PyreonCrashTransportRegistry` mirror), so
 * the framework owns capture+persist and never fakes an upload.
 *
 * SSR-safe: on the server every read returns the empty state and `start()`
 * no-ops (no `window`).
 *
 * @example
 * ```tsx
 * const crash = useCrashReporter()
 * onMount(() => crash.start())
 * <Show when={() => crash.hadCrash}>
 *   <Banner>We're sorry — the app crashed last time.</Banner>
 * </Show>
 * ```
 */
export function useCrashReporter(): UseCrashReporterResult {
  const lastCrash = signal('')
  const hadCrash = signal(false)
  const breadcrumbs: string[] = []
  let started = false

  const persist = (message: string, stack: string): void => {
    if (!isClient) return
    const report: CrashReport = {
      platform: 'web',
      message,
      stack,
      breadcrumbs: [...breadcrumbs],
      timestamp: new Date().toISOString(),
    }
    try {
      window.localStorage.setItem(KEY, JSON.stringify(report))
    } catch {
      /* quota / disabled storage — a crash reporter must never itself throw */
    }
  }

  return {
    get lastCrash() {
      return lastCrash()
    },
    get hadCrash() {
      return hadCrash()
    },
    recordError(message: string) {
      persist(message, new Error(message).stack ?? '')
      _transport?.(message)
    },
    breadcrumb(message: string) {
      breadcrumbs.push(message)
      if (breadcrumbs.length > 32) breadcrumbs.shift()
    },
    clear() {
      lastCrash.set('')
      hadCrash.set(false)
      if (isClient) {
        try {
          window.localStorage.removeItem(KEY)
        } catch {
          /* ignore */
        }
      }
    },
    start() {
      if (started || !isClient) return
      started = true
      // Rehydrate the previous session's report — NOT cleared on read (the
      // app decides via clear()), so a transport wired one load late still
      // sees it. Mirrors the native rehydrate.
      try {
        const raw = window.localStorage.getItem(KEY)
        if (raw) {
          lastCrash.set(raw)
          hadCrash.set(true)
          _transport?.(raw)
        }
      } catch {
        /* ignore */
      }
      const onError = (event: ErrorEvent) => {
        persist(event.message, event.error?.stack ?? '')
      }
      const onRejection = (event: PromiseRejectionEvent) => {
        const reason = event.reason
        persist(String(reason?.message ?? reason), reason?.stack ?? '')
      }
      window.addEventListener('error', onError)
      window.addEventListener('unhandledrejection', onRejection)
      onHookCleanup(() => {
        window.removeEventListener('error', onError)
        window.removeEventListener('unhandledrejection', onRejection)
      })
    },
  }
}

let _transport: ((report: string) => void) | undefined

/**
 * Wire the vendor transport (Sentry, a custom endpoint, …). Mirrors the
 * native `PyreonCrashTransportRegistry.send`. Called with the rehydrated
 * report on `start()` and with each `recordError`.
 */
export function setCrashTransport(send: ((report: string) => void) | undefined): void {
  _transport = send
}
