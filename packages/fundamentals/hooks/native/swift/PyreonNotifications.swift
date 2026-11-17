// PyreonNotifications — the SwiftUI side of Pyreon's LOCAL-notification
// service (M3.3). Mirrors the core `@pyreon/hooks` `useNotifications` shape
// and the Kotlin `PyreonNotifications` one-for-one.
//
// Distinct from PyreonPushNotifications (which RECEIVES remote push): this
// SCHEDULES a local notification from the app itself.
//
// Surface:
//
//     notifs.requestPermission()          // prompt for authorization
//     notifs.notify("Title", "Body")      // post a local notification
//
// `UNUserNotificationCenter` is the system local/remote notification API.
// It gates delivery on a user authorization grant, so `notify` requests
// authorization first and posts on grant (a no-op if denied). A 1s trigger
// is used rather than `nil` because an immediate (`nil`) trigger only
// surfaces a banner while the app is backgrounded on some iOS versions; a
// short delay delivers reliably.
//
// UserNotifications is cross-platform (iOS + macOS), but guarded with
// `#if canImport(UserNotifications)` so a Linux/Foundation-only build
// compiles to no-op method bodies (matching how the other runtime files
// branch). No third-party dependency.

import Foundation

#if canImport(UserNotifications)
import UserNotifications
#endif

#if canImport(UserNotifications)
/// Presents a notification that arrives while the app is in the FOREGROUND.
///
/// Without a `UNUserNotificationCenter` delegate, iOS answers its own
/// `willPresent` with "present nothing": the notification is neither shown
/// nor kept in Notification Center (the system log reads `shouldPresentAlert:
/// NO`, `Saving notification: NO`). `notify` fires one second after the tap
/// that called it, so the app is almost always still in the foreground, and
/// the notification vanished — while Android posts it and the web shows it.
/// Presenting it as a banner, in the list and with its sound restores parity.
///
/// Installed once, and only when the app has no delegate of its own: an app
/// that set one keeps full control of foreground presentation. The center
/// holds its delegate weakly, so the instance is kept here for the process's
/// lifetime (one object, never replaced).
final class PyreonForegroundNotificationPresenter: NSObject, UNUserNotificationCenterDelegate {
    static let shared = PyreonForegroundNotificationPresenter()

    static func installIfUnset(on center: UNUserNotificationCenter) {
        if center.delegate == nil { center.delegate = shared }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .list, .sound])
    }
}
#endif

/// Local-notification wrapper — the SwiftUI half of `useNotifications`.
public final class PyreonNotifications {
    public init() {}

    /// Request notification authorization (alert + sound + badge).
    public func requestPermission() {
        #if canImport(UserNotifications)
        UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
        #endif
    }

    /// Post a local notification. Requests authorization on first use and
    /// posts on grant (silently no-ops if the user has denied).
    public func notify(_ title: String, _ body: String) {
        #if canImport(UserNotifications)
        let center = UNUserNotificationCenter.current()
        PyreonForegroundNotificationPresenter.installIfUnset(on: center)
        center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            guard granted else { return }
            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            content.sound = .default
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
            let request = UNNotificationRequest(
                identifier: UUID().uuidString,
                content: content,
                trigger: trigger,
            )
            center.add(request, withCompletionHandler: nil)
        }
        #endif
    }
}
