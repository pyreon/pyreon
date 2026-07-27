/**
 * Abort-signal composition (caller cancellation × timeout).
 *
 * Implemented with a plain `AbortController` + `setTimeout` rather than
 * `AbortSignal.any` / `AbortSignal.timeout` for two reasons: those are
 * recent baseline (the framework has no confirmed floor for them), and a
 * hand-rolled controller lets us report a timeout as {@link TimeoutError}
 * instead of an opaque `DOMException`.
 *
 * ## Why raw `addEventListener` here (and not `useEventListener`)
 *
 * `pyreon/no-raw-addeventlistener` normally points you at
 * `@pyreon/hooks`'s `useEventListener`, which ties removal to component
 * unmount. That does not apply on two counts, which is why
 * `packages/fundamentals/http/` is exempted in `.pyreonlintrc.json`:
 * this package has ZERO dependencies by design (depending on
 * `@pyreon/hooks` would invert the layering and forfeit that), and the
 * listener is attached to an `AbortSignal` inside an imperative request,
 * not to a DOM node inside a component lifetime. Every site pairs
 * `{ once: true }` with an explicit `removeEventListener`, which is the
 * guarantee the rule exists to enforce — same rationale as the
 * `@pyreon/hooks` / `@pyreon/storage` exemptions.
 *
 * Two leak classes are in play and both are closed here:
 * - class I (orphaned timer) — `clearTimeout` runs in the caller's
 *   `finally`, on BOTH the success and failure paths.
 * - class D (listener pile-up) — the `abort` listener registered on the
 *   caller's signal is removed by the same cleanup, so a long-lived signal
 *   (one `AbortController` reused across many requests) cannot accumulate
 *   one listener per request.
 */

/** A composed signal plus its mandatory cleanup. */
export interface LinkedSignal {
  /** `undefined` when there is nothing to cancel on. */
  signal: AbortSignal | undefined
  /** MUST be called when the request settles, on every path. */
  cleanup: () => void
  /** True once the timeout (rather than the caller) fired the abort. */
  timedOut: () => boolean
}

const NOOP = (): void => {}

/** Compose a caller signal and a timeout into one signal. */
export function linkSignals(
  userSignal: AbortSignal | undefined,
  timeoutMs: number | false | undefined,
): LinkedSignal {
  const hasTimeout = typeof timeoutMs === 'number' && timeoutMs > 0
  if (!userSignal && !hasTimeout) {
    return { signal: undefined, cleanup: NOOP, timedOut: () => false }
  }

  const controller = new AbortController()
  let timedOut = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let onUserAbort: (() => void) | undefined

  if (userSignal) {
    if (userSignal.aborted) {
      controller.abort(userSignal.reason)
    } else {
      onUserAbort = () => controller.abort(userSignal.reason)
      userSignal.addEventListener('abort', onUserAbort, { once: true })
    }
  }

  if (hasTimeout && !controller.signal.aborted) {
    timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      if (timer !== undefined) {
        clearTimeout(timer)
        timer = undefined
      }
      if (userSignal && onUserAbort) {
        userSignal.removeEventListener('abort', onUserAbort)
        onUserAbort = undefined
      }
    },
    timedOut: () => timedOut,
  }
}
