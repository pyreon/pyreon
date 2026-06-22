// PyreonPushNotifications — the SwiftUI side of Pyreon's cross-platform push
// story (Tier 3). Mirrors a web-ish `usePush` reactive surface and the Kotlin
// `PyreonPushNotifications` one-for-one.
//
// ## What this delivers
//
// An `@Observable` reactive push container:
//
//     push.token            // the APNs/FCM device token, nil until registered
//     push.lastNotification // the most recent inbound notification
//     push.notifications    // every inbound notification in order
//     push.isAuthorized     // true once the user grants notification permission
//     push.error            // most recent failure, nil on success
//
// A SwiftUI view reads these and re-renders as the token arrives / a
// notification lands / the permission flips (an in-app banner, an unread
// badge, a "enable notifications" prompt gated on `isAuthorized`).
//
// ## Pure state + INJECTED registration (both platforms)
//
// Push is unusual: the device token does NOT arrive through a delegate the
// container can own — it lands in the app's `AppDelegate`
// (`didRegisterForRemoteNotificationsWithDeviceToken`) on iOS and in the
// `FirebaseMessagingService` on Android. So unlike geolocation (where iOS has
// a self-owned `CLLocationManager`), push registration is INJECTED on BOTH
// platforms: the app forwards token / notification / authorization events
// from its AppDelegate / FCM service into the handler thunks. The reactive
// STATE machine (`tokenReceived` / `notificationReceived` / `authorize` /
// `fail`) is pure and synchronously unit-testable on both targets.
//
// ## Relationship to the PMTC compiler emit
//
// A later emit pass detects `const push = usePush()` and emits a
// `PyreonPushNotifications` instance; `push.token` / `push.lastNotification`
// reads become reads on this container, and the app's AppDelegate forwards
// events via `start(register:)`. Until that lands, this is usable by
// hand-written SwiftUI code.

import Foundation
import Observation

/// A received push notification — title + body + arbitrary data payload.
/// Mirrors the Kotlin `PyreonPushNotification`.
public struct PyreonPushNotification: Sendable, Equatable {
    public let title: String?
    public let body: String?
    public let data: [String: String]

    public init(title: String? = nil, body: String? = nil, data: [String: String] = [:]) {
        self.title = title
        self.body = body
        self.data = data
    }
}

/// The callbacks the app's AppDelegate / FCM service forwards push events to.
/// Supplied to the app's `register` by `start(register:)`. Plain (non-
/// Sendable) closures — the app forwards events synchronously on the main
/// thread (AppDelegate callbacks run there), so there is no cross-actor hop.
public struct PyreonPushHandlers {
    public let onToken: (String) -> Void
    public let onNotification: (PyreonPushNotification) -> Void
    public let onAuthorization: (Bool) -> Void
    public let onError: (Error) -> Void
}

/// Observable push container — the SwiftUI half of `usePush`.
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonPushNotifications {
    /// The APNs/FCM device token, or `nil` until registered. Send this to
    /// your server so it can target this device.
    public private(set) var token: String?
    /// The most recent inbound notification, or `nil` before the first.
    public private(set) var lastNotification: PyreonPushNotification?
    /// Every inbound notification in arrival order.
    public private(set) var notifications: [PyreonPushNotification] = []
    /// True once the user grants notification permission.
    public private(set) var isAuthorized: Bool = false
    /// Most recent failure, or `nil` on success / before first start.
    public private(set) var error: Error?

    /// The app-supplied unregister thunk. Nil until `start`; held for `stop`.
    @ObservationIgnored private var unregister: (() -> Void)?
    /// Lifecycle flag — guards `start` / `stop` (mirrors NetworkStatus).
    @ObservationIgnored private var _started: Bool = false

    public init() {}

    /// True iff currently forwarding push events (between a matched
    /// `start` / `stop` pair). Not observable for re-render.
    public var isRegistered: Bool { _started }

    // MARK: - Pure state-machine transitions

    /// Record the device token (from the AppDelegate / FCM service).
    public func tokenReceived(_ token: String) {
        self.token = token
        self.error = nil
    }

    /// Record an inbound notification: set `lastNotification`, append to
    /// `notifications`.
    public func notificationReceived(_ notification: PyreonPushNotification) {
        lastNotification = notification
        notifications.append(notification)
    }

    /// Record the authorization state (granted / denied).
    public func authorize(_ granted: Bool) {
        isAuthorized = granted
    }

    /// Record a failure: set `error`. Leaves prior token / notifications in
    /// place (stale-while-error).
    public func fail(_ failure: Error) {
        error = failure
    }

    // MARK: - Injected registration edge

    /// Begin forwarding push events via the app-supplied `register`. The app
    /// wires its AppDelegate (`didRegisterForRemoteNotifications…` /
    /// `didReceiveRemoteNotification`) or FCM service to the handler thunks
    /// (which drive the pure transitions), and returns an unregister thunk
    /// stored for `stop()`. Idempotent — a second call while registered is a
    /// no-op; `register` is NOT invoked a second time.
    public func start(register: (PyreonPushHandlers) -> (() -> Void)) {
        guard !_started else { return }
        _started = true
        unregister = register(
            PyreonPushHandlers(
                onToken: { [weak self] t in self?.tokenReceived(t) },
                onNotification: { [weak self] n in self?.notificationReceived(n) },
                onAuthorization: { [weak self] g in self?.authorize(g) },
                onError: { [weak self] e in self?.fail(e) }
            )
        )
    }

    /// Stop forwarding and release the registration. Safe to call when not
    /// started (no-op) AND safe to call twice (early-returns on `_started`).
    public func stop() {
        guard _started else { return }
        _started = false
        unregister?()
        unregister = nil
    }
}
