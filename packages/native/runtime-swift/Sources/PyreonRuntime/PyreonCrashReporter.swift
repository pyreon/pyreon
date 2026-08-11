// PyreonCrashReporter — the native runtime container `useCrashReporter()`
// lowers to. The CAPTURE + PERSIST + REHYDRATE half of crash reporting,
// credential-free by design: the vendor TRANSPORT (Sentry, Crashlytics, a
// custom endpoint) is app-wired through `PyreonCrashTransportRegistry`, so
// the framework proves the part no credential gates — an uncaught error is
// captured, written to disk, and readable on the NEXT launch — and an app
// adds shipping-grade upload with one closure.
//
//     let crash = PyreonCrashReporter()
//     crash.start()          // installs the NSException hook + rehydrates
//     crash.lastCrash        // previous launch's report, "" when none
//     crash.recordError("…") // manual capture (caught errors, assertions)
//     crash.breadcrumb("…")  // ring buffer, attached to the next report
//
// HONEST SCOPE (v1): `NSSetUncaughtExceptionHandler` captures uncaught
// NSExceptions; SIGNAL crashes (SIGSEGV/SIGABRT from Swift fatalError and
// memory errors) are NOT captured — signal-safe crash handling is a
// substantial follow-up (what vendor SDKs exist for). `recordError` covers
// the manual path today. Stated here and in the matrix rather than implied
// away.
//
// The capture STATE (record/breadcrumb/rehydrate/clear) is pure and
// unit-testable against a temp directory; only the exception-hook wiring in
// `start()` needs a real process to prove. Mirrors PyreonAppState's
// start()-idempotency + sticky-assertable-state design.

import Foundation
import Observation

/// App-wired transport seam — same shape as the push/geolocation registries:
/// a framework default that would need a vendor credential does not exist,
/// so the slot is explicit and the framework never fakes an upload.
public enum PyreonCrashTransportRegistry {
    /// Called with the previous launch's report on `start()` rehydrate, and
    /// with each `recordError` report. Wire in Application setup.
    public static var send: ((String) -> Void)?
}

@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonCrashReporter {
    /// The PREVIOUS launch's crash report (JSON string), "" when the last
    /// launch exited cleanly. Populated by `start()` from the persisted
    /// file — the rehydrate half of the device proof.
    public private(set) var lastCrash: String = ""

    /// STICKY: true once THIS launch found a persisted report. The
    /// device-test assertion surface (the PyreonAppState `wasBackgrounded`
    /// pattern): an end-state a never-started reporter can never reach.
    public private(set) var hadCrash: Bool = false

    @ObservationIgnored private var _started = false
    @ObservationIgnored private var breadcrumbs: [String] = []
    @ObservationIgnored private let dir: URL

    /// Whether the exception hook is installed. Not observable — a status
    /// read must not force a re-render.
    public var isMonitoring: Bool { _started }

    /// `directory` injectable for tests; defaults to Application Support,
    /// which survives relaunches (the whole point).
    public init(directory: URL? = nil) {
        if let directory {
            dir = directory
        } else {
            let base = FileManager.default.urls(
                for: .applicationSupportDirectory, in: .userDomainMask
            ).first ?? FileManager.default.temporaryDirectory
            dir = base.appendingPathComponent("pyreon-crash", isDirectory: true)
        }
    }

    private var reportURL: URL { dir.appendingPathComponent("last-crash.json") }

    /// Install the uncaught-NSException hook + rehydrate any persisted
    /// report. Idempotent. The hook writes SYNCHRONOUSLY — the process is
    /// about to die, there is no later.
    public func start() {
        guard !_started else { return }
        _started = true
        rehydrate()
        // The C-function hook cannot capture `self`; route through a static
        // slot (one live reporter owns crash capture — the deep-link
        // single-slot doctrine: an append-only list on a global is the
        // unbounded-growth shape).
        PyreonCrashReporter.active = self
        NSSetUncaughtExceptionHandler { exception in
            PyreonCrashReporter.active?.persist(
                message: "\(exception.name.rawValue): \(exception.reason ?? "")",
                stack: exception.callStackSymbols.joined(separator: "\n")
            )
        }
    }

    @ObservationIgnored nonisolated(unsafe) static var active: PyreonCrashReporter?

    /// Manual capture — caught errors, assertion failures, "should never
    /// happen" branches. Persists AND forwards to the transport when wired.
    public func recordError(_ message: String) {
        persist(message: message, stack: Thread.callStackSymbols.joined(separator: "\n"))
        PyreonCrashTransportRegistry.send?(message)
    }

    /// Ring-buffered context attached to the next report (capped — a crash
    /// reporter must never be its own unbounded-growth bug).
    public func breadcrumb(_ message: String) {
        breadcrumbs.append(message)
        if breadcrumbs.count > 32 { breadcrumbs.removeFirst() }
    }

    /// Acknowledge the rehydrated report (e.g. after showing an apology UI
    /// or forwarding it). Clears the observable state AND the file.
    public func clear() {
        lastCrash = ""
        hadCrash = false
        try? FileManager.default.removeItem(at: reportURL)
    }

    // MARK: - internals (pure vs the injected directory — unit-tested)

    func persist(message: String, stack: String) {
        let report: [String: Any] = [
            "message": message,
            "stack": stack,
            "breadcrumbs": breadcrumbs,
            "timestamp": ISO8601DateFormatter().string(from: Date()),
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: report) else { return }
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try? data.write(to: reportURL, options: .atomic)
    }

    func rehydrate() {
        guard let data = try? Data(contentsOf: reportURL),
              let text = String(data: data, encoding: .utf8), !text.isEmpty
        else { return }
        lastCrash = text
        hadCrash = true
        PyreonCrashTransportRegistry.send?(text)
        // Deliberately NOT cleared on read: the app decides when the report
        // is handled (`clear()`), so a transport wired one launch late still
        // sees it.
    }
}
