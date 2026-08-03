// usePush — the push-notification state container, shared across
// web / iOS / Android.
//
// The native half exists on both targets: PMTC lowers `usePush()` to
// `PyreonPushNotifications` (`@Observable` Swift / Compose-state Kotlin).
// The WEB half did not exist — no implementation, no export, no type
// anywhere outside `packages/native/` — the fifth hook with the gap
// `useGeolocation` / `useDatabase` / `useWebSocket` / `useAuth` had: PMTC
// matches hook NAMES and never resolves imports, so the shared import
// resolved on native and nowhere else.
//
// MEMBER NAMES AND TRANSITION SEMANTICS MIRROR `PyreonPushNotifications`
// EXACTLY:
//
//   token             String?                  -> string | null
//   lastNotification  PyreonPushNotification?  -> PyreonPushNotification | null
//   notifications     [PyreonPushNotification] -> PyreonPushNotification[]
//   isAuthorized      Bool                     -> boolean
//   error             Error?                   -> string | null (rendered — the
//                       compiler's SERVICE_OPTIONAL_FIELDS types `push.error`
//                       as `string`)
//   isRegistered      (NOT reactive — mirrors the native @ObservationIgnored)
//   tokenReceived / notificationReceived / authorize / fail
//   start(register) / stop()
//
// PURE STATE + INJECTED REGISTRATION — the same design on all three targets,
// and on push it is not a convenience but the only correct shape: the device
// token does NOT arrive through anything the container can own. Natively it
// lands in the AppDelegate / FirebaseMessagingService; on web it comes out of
// a service-worker `PushManager.subscribe()` flow the APP orchestrates
// (permission prompt timing is a product decision, and the SW registration
// belongs to the app shell). So `start(register)` hands the app a set of
// handler thunks that drive the pure transitions, and the app wires its edge
// — `pushManager.subscribe().then(sub => handlers.onToken(...))`,
// `Notification.requestPermission().then(p => handlers.onAuthorization(...))`
// — exactly as the native AppDelegate does. The container stays edge-free and
// synchronously unit-testable on every target.
//
// TRANSITION DETAILS THAT ARE EASY TO GET WRONG (each mirrors the Swift/Kotlin
// containers line-for-line, and each has a test):
//   - `tokenReceived` clears `error`; `notificationReceived` and `authorize`
//     do NOT touch it.
//   - `fail` keeps the prior token + notifications (stale-while-error).
//   - `start` is idempotent — a second call while registered does NOT invoke
//     `register` again; `stop` is safe when not started and safe twice.

import { batch, signal } from '@pyreon/reactivity'

/**
 * A received push notification — title + body + string payload. Mirrors the
 * native `PyreonPushNotification` (whose `data` is `[String: String]`, so the
 * web type is deliberately no wider).
 */
export interface PyreonPushNotification {
  readonly title: string | null
  readonly body: string | null
  readonly data: Readonly<Record<string, string>>
}

/**
 * The callbacks the app's push edge forwards events to. Handed to `register`
 * by `start()` — the web analogue of the AppDelegate / FCM-service thunks.
 */
export interface PyreonPushHandlers {
  onToken(token: string): void
  onNotification(notification: PyreonPushNotification): void
  onAuthorization(granted: boolean): void
  onError(failure: string): void
}

/** Push-state handle. Mirrors the native `PyreonPushNotifications`. */
export interface UsePushResult {
  /** The device/subscription token, or `null` until registered. */
  readonly token: string | null
  /** Most recent inbound notification, or `null` before the first. */
  readonly lastNotification: PyreonPushNotification | null
  /** Every inbound notification in arrival order. */
  readonly notifications: PyreonPushNotification[]
  /** True once the user grants notification permission. */
  readonly isAuthorized: boolean
  /** Most recent failure, or `null` on success / before first start. */
  readonly error: string | null
  /**
   * True between a matched `start`/`stop` pair. Deliberately NOT reactive —
   * the native field is `@ObservationIgnored` for the same reason (it is
   * lifecycle bookkeeping, not render state).
   */
  readonly isRegistered: boolean
  /** Record the device token (clears `error`). */
  tokenReceived(token: string): void
  /** Record an inbound notification. */
  notificationReceived(notification: PyreonPushNotification): void
  /** Record the authorization state. */
  authorize(granted: boolean): void
  /** Record a failure. Prior token/notifications stay (stale-while-error). */
  fail(failure: string): void
  /**
   * Begin forwarding push events via the app-supplied `register`, which
   * receives the handler thunks and returns an unregister thunk stored for
   * `stop()`. Idempotent — a second call while registered is a no-op and
   * `register` is NOT invoked again.
   */
  start(register: (handlers: PyreonPushHandlers) => () => void): void
  /** Stop forwarding and release the registration. Safe when not started. */
  stop(): void
}

/**
 * Reactive push-notification container — the web half of the cross-platform
 * `usePush` story. See the header for the exact native mirror contract.
 */
export function usePush(): UsePushResult {
  const token = signal<string | null>(null)
  const lastNotification = signal<PyreonPushNotification | null>(null)
  const notifications = signal<PyreonPushNotification[]>([])
  const isAuthorized = signal(false)
  const error = signal<string | null>(null)

  let started = false
  let unregister: (() => void) | null = null

  const tokenReceived = (next: string): void => {
    batch(() => {
      token.set(next)
      error.set(null)
    })
  }
  const notificationReceived = (notification: PyreonPushNotification): void => {
    batch(() => {
      lastNotification.set(notification)
      notifications.set([...notifications.peek(), notification])
    })
  }
  const authorize = (granted: boolean): void => {
    isAuthorized.set(granted)
  }
  const fail = (failure: string): void => {
    error.set(failure)
  }

  return {
    get token() {
      return token()
    },
    get lastNotification() {
      return lastNotification()
    },
    get notifications() {
      return notifications()
    },
    get isAuthorized() {
      return isAuthorized()
    },
    get error() {
      return error()
    },
    get isRegistered() {
      return started
    },
    tokenReceived,
    notificationReceived,
    authorize,
    fail,
    start(register) {
      if (started) return
      started = true
      unregister = register({
        onToken: tokenReceived,
        onNotification: notificationReceived,
        onAuthorization: authorize,
        onError: fail,
      })
    },
    stop() {
      if (!started) return
      started = false
      unregister?.()
      unregister = null
    },
  }
}
