// useNotifications — schedule a LOCAL notification.
//
// A cross-platform imperative hook (no reactive state): call `notify` to
// post a local notification. Mirrors the shape the PMTC native compiler
// recognizes — `const notifs = useNotifications(); notifs.notify(t, b)`
// lowers to `PyreonNotifications` on iOS (UNUserNotificationCenter) and
// Android (NotificationManager + a channel), and uses the web Notification
// API on the web.
//
// Distinct from `usePush` (which RECEIVES remote push): this schedules a
// LOCAL notification from the app itself. STRING-METHOD API (like useShare)
// so the call lowers to native with zero argument transformation.
//
// Permission: all three platforms gate notifications on a user grant. iOS
// requires `requestAuthorization`, Android 13+ requires the
// `POST_NOTIFICATIONS` runtime permission, and the web requires
// `Notification.requestPermission()`. `notify` auto-requests on first use;
// `requestPermission` lets you prompt ahead of time (e.g. behind a settings
// toggle).

import { isClient } from '@pyreon/reactivity'

export interface UseNotificationsResult {
  /** Request notification permission ahead of time. */
  requestPermission: () => void
  /** Post a local notification (auto-requests permission if not yet granted). */
  notify: (title: string, body: string) => void
}

function post(title: string, body: string): void {
  // eslint-disable-next-line no-new -- the Notification side effect IS the API
  new Notification(title, { body })
}

/**
 * Post local notifications from a Pyreon app.
 *
 * @example
 * ```tsx
 * const notifs = useNotifications()
 *
 * <button onClick={() => notifs.notify("Saved", "Your changes are saved")}>
 *   Save
 * </button>
 * ```
 */
export function useNotifications(): UseNotificationsResult {
  const available = (): boolean => isClient && typeof Notification !== 'undefined'
  return {
    requestPermission: () => {
      if (!available()) return
      void Notification.requestPermission()
    },
    notify: (title, body) => {
      if (!available()) return
      if (Notification.permission === 'granted') {
        post(title, body)
      } else if (Notification.permission !== 'denied') {
        // Not yet decided — request, then post on grant.
        void Notification.requestPermission().then((permission) => {
          if (permission === 'granted') post(title, body)
        })
      }
    },
  }
}
