import { isClient, onCleanup, signal } from '@pyreon/reactivity'

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
  /** The PREVIOUS session's crash report (JSON string); `''` when none. */
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
    const report = JSON.stringify([message, stack, breadcrumbs.join('\n')])
    try {
      window.localStorage.setItem(KEY, report)
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
      onCleanup(() => {
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
