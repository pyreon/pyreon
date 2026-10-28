// PyreonToaster — the overlay `<Toaster />` lowers to on iOS.
//
// The web `<Toaster>` is a `position: fixed` portal: it takes no layout space,
// sits at a screen corner, and stays put across navigation. The emit used to
// lower it to an inline `VStack` of `Text`s, which is none of those. Worse, an
// app places `<Toaster />` beside its `<RouterView />`, which lands it in the
// NavigationStack's ROOT content, and a pushed screen covers the root: a toast
// fired from any pushed screen was never visible.
//
// No in-tree placement survives that, so on iOS the stack lives in its own
// pass-through window above the app. `<Toaster />` itself renders nothing; it
// installs the window when it appears and leaves it installed, like the web
// Toaster mounted at the app root. The window is hidden while the queue is
// empty and passes every touch through to the app.
//
// Mirrors the web stylesheet: a white card, 8pt corners, a 4pt accent strip in
// the toast type's color, 14pt medium text; `max` most-recent toasts, `gap`
// between them, `offset` from the screen edge. Error and warning toasts are
// announced to VoiceOver with high priority, info and success with default
// priority — the web's alert/status split. Motion respects Reduce Motion.
//
// `_Concurrency.Task`, never a bare `Task`: this file compiles INTO the app
// target, and an app with its own `Task` model would shadow the concurrency type.

import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/// `<Toaster />`'s props. Defaults are the web `ToasterProps` defaults.
public struct PyreonToasterConfig: Equatable {
    public var position: String
    public var max: Int
    public var gap: Double
    public var offset: Double
    /// Default auto-dismiss in MILLISECONDS for toasts that set none (the web
    /// prop's unit); nil leaves the queue's default. 0 = persistent.
    public var duration: Double?

    public init(position: String = "top-right", max: Int = 5, gap: Double = 8, offset: Double = 16, duration: Double? = nil) {
        self.position = position
        self.max = max
        self.gap = gap
        self.offset = offset
        self.duration = duration
    }

    /// Whether the stack sits at the bottom edge (else the top).
    var isBottom: Bool { position.hasPrefix("bottom-") }

    /// `left` / `center` / `right`; an unknown value is the web default, right.
    var horizontal: String {
        if position.hasSuffix("-left") { return "left" }
        if position.hasSuffix("-center") { return "center" }
        return "right"
    }

    var stackAlignment: HorizontalAlignment {
        switch horizontal {
        case "left": return .leading
        case "center": return .center
        default: return .trailing
        }
    }

    var frameAlignment: Alignment {
        switch (isBottom, horizontal) {
        case (true, "left"): return .bottomLeading
        case (true, "center"): return .bottom
        case (true, _): return .bottomTrailing
        case (false, "left"): return .topLeading
        case (false, "center"): return .top
        default: return .topTrailing
        }
    }
}

/// The web stylesheet's accent (left border) color per toast type.
func pyreonToastAccent(_ type: String) -> Color {
    switch type {
    case "success": return Color(red: 0x22 / 255, green: 0xC5 / 255, blue: 0x5E / 255)
    case "warning": return Color(red: 0xF5 / 255, green: 0x9E / 255, blue: 0x0B / 255)
    case "error": return Color(red: 0xEF / 255, green: 0x44 / 255, blue: 0x44 / 255)
    default: return Color(red: 0x3B / 255, green: 0x82 / 255, blue: 0xF6 / 255)
    }
}

/// The stack of visible toasts, aligned to the configured corner of whatever
/// space it is given (the overlay window on iOS).
@available(iOS 17.0, macOS 14.0, *)
public struct PyreonToastStack: View {
    let config: PyreonToasterConfig
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(config: PyreonToasterConfig) {
        self.config = config
    }

    public var body: some View {
        let visible = Array(PyreonToast.shared.toasts.suffix(Swift.max(0, config.max)))
        VStack(alignment: config.stackAlignment, spacing: config.gap) {
            ForEach(visible) { item in
                PyreonToastCard(item: item)
                    .transition(
                        reduceMotion
                            ? .opacity
                            : .opacity.combined(with: .offset(y: config.isBottom ? 8 : -8))
                    )
            }
        }
        .padding(config.offset)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: config.frameAlignment)
        .animation(.easeOut(duration: 0.2), value: visible.map(\.id))
    }
}

@available(iOS 17.0, macOS 14.0, *)
struct PyreonToastCard: View {
    let item: PyreonToastItem

    var body: some View {
        HStack(spacing: 0) {
            Rectangle().fill(pyreonToastAccent(item.type)).frame(width: 4)
            Text(item.message)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Color(red: 0x1A / 255, green: 0x1A / 255, blue: 0x1A / 255))
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
        }
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: 360, alignment: .leading)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .shadow(color: .black.opacity(0.15), radius: 6, y: 4)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("pyreon-toast")
        .onAppear {
            var announcement = AttributedString(item.message)
            announcement.accessibilitySpeechAnnouncementPriority =
                (item.type == "error" || item.type == "warning") ? .high : .default
            AccessibilityNotification.Announcement(announcement).post()
        }
    }
}

/// `<Toaster />`. Renders nothing in place on iOS: it installs the overlay
/// window that shows the stack. Where UIKit is unavailable (macOS builds of the
/// runtime) it renders the stack in place.
@available(iOS 17.0, macOS 14.0, *)
public struct PyreonToaster: View {
    let config: PyreonToasterConfig

    public init(position: String = "top-right", max: Int = 5, gap: Double = 8, offset: Double = 16, duration: Double? = nil) {
        self.config = PyreonToasterConfig(position: position, max: max, gap: gap, offset: offset, duration: duration)
    }

    public var body: some View {
        #if canImport(UIKit)
        Color.clear
            .frame(width: 0, height: 0)
            .accessibilityHidden(true)
            .onAppear { PyreonToastOverlay.shared.install(config) }
        #else
        PyreonToastStack(config: config)
            .onAppear {
                if let duration = config.duration { PyreonToast.shared.defaultDuration = duration / 1000 }
            }
        #endif
    }
}

#if canImport(UIKit)
/// The overlay window's owner. One per process, like the web Toaster's portal.
@available(iOS 17.0, *)
@MainActor
final class PyreonToastOverlay {
    static let shared = PyreonToastOverlay()

    private var window: PyreonPassThroughWindow?
    private var host: UIHostingController<PyreonToastStack>?
    private var hideTask: _Concurrency.Task<Void, Never>?

    /// Install the window on first call; later calls only update the config.
    func install(_ config: PyreonToasterConfig) {
        if let duration = config.duration {
            PyreonToast.shared.defaultDuration = duration / 1000
        }
        if let host {
            host.rootView = PyreonToastStack(config: config)
            return
        }
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        guard let scene = scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first else {
            return
        }
        let host = UIHostingController(rootView: PyreonToastStack(config: config))
        host.view.backgroundColor = .clear
        let window = PyreonPassThroughWindow(windowScene: scene)
        window.windowLevel = .alert + 1
        window.backgroundColor = .clear
        window.rootViewController = host
        self.window = window
        self.host = host
        track()
    }

    /// Show the window while toasts exist; hide it once the queue empties,
    /// after the last toast's leave transition has played.
    private func sync() {
        hideTask?.cancel()
        if !PyreonToast.shared.toasts.isEmpty {
            window?.isHidden = false
            return
        }
        hideTask = _Concurrency.Task { @MainActor [weak self] in
            try? await _Concurrency.Task.sleep(nanoseconds: 300_000_000)
            guard !_Concurrency.Task.isCancelled, PyreonToast.shared.toasts.isEmpty else { return }
            self?.window?.isHidden = true
        }
    }

    /// Re-run `sync` whenever the queue changes between empty and non-empty.
    private func track() {
        sync()
        withObservationTracking {
            _ = PyreonToast.shared.toasts.isEmpty
        } onChange: { [weak self] in
            _Concurrency.Task { @MainActor in self?.track() }
        }
    }
}

/// A window that never claims a touch: every touch falls through to the app
/// beneath. A native toast carries no buttons (no dismiss or action yet), so
/// nothing in it needs input, and a card must not swallow a tap meant for the
/// control it happens to cover.
final class PyreonPassThroughWindow: UIWindow {
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? { nil }
}
#endif
