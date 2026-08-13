// PyreonRateLimit — the CoreConcurrency side of `@pyreon/hooks`'
// useDebouncedCallback / useThrottledCallback.
//
// These two need a RUNTIME where useDebouncedValue did not: they return a
// callable carrying `.cancel()` / `.flush()`, so there is a cancellable
// handle and a latest-args slot to hold. A `.task(id:)` cannot express that
// — it has no identity a caller can reach.
//
// ## The edges are the contract
//
// Measured on the web before these were written (see
// native-callback-throttle-parity.test.ts), because two native ports would
// otherwise agree with each other on the wrong ones:
//
//   debounce → NO leading edge; nothing fires until the caller goes quiet.
//   throttle → leading edge AND a trailing one, carrying the LATEST args.
//
// ## Why a Scheduler seam
//
// `sleep` is injected so the state machines above are testable
// synchronously, with no real clock and no flake. The default schedules on
// the concurrency runtime; a test passes a fake that fires on demand. A
// timing test that actually waits is a timing test that eventually flakes on
// a loaded CI runner — this repo has already paid for that lesson once.

import Foundation

/// The delay half of a rate limiter, injected so the machines are testable.
public protocol PyreonScheduler: AnyObject {
    /// Run `work` after `milliseconds`, unless cancelled first.
    /// Returns a token the caller cancels.
    func schedule(after milliseconds: Int, _ work: @escaping () -> Void) -> Int
    func cancel(_ token: Int)
}

/// Default scheduler — a detached concurrency task per pending call.
public final class TaskScheduler: PyreonScheduler {
    private var next = 0
    private var tasks: [Int: _Concurrency.Task<Void, Never>] = [:]

    public init() {}

    public func schedule(after milliseconds: Int, _ work: @escaping () -> Void) -> Int {
        next += 1
        let token = next
        tasks[token] = _Concurrency.Task { [weak self] in
            try? await _Concurrency.Task.sleep(nanoseconds: UInt64(milliseconds) * 1_000_000)
            if _Concurrency.Task.isCancelled { return }
            self?.tasks[token] = nil
            work()
        }
        return token
    }

    public func cancel(_ token: Int) {
        tasks[token]?.cancel()
        tasks[token] = nil
    }
}

/// Trailing-edge debounce over a single-argument callback.
///
/// Single-argument by design: the web hook is variadic, but a variadic
/// native port would need a boxed args tuple whose type the emit cannot
/// know. One argument covers the shapes that actually appear (a query
/// string, an id, an event) and the compiler declines anything else BY NAME
/// rather than silently dropping arguments.
public final class PyreonDebounced<A> {
    /// Assignable rather than `let`: a `@State` property initializer runs
    /// before `self` exists, so a closure capturing sibling state cannot be
    /// passed to `init`. The emit binds it in `.onAppear` — the same
    /// post-init attachment PyreonForm's onSubmit uses, for the same reason.
    public var action: (A) -> Void
    private let delayMs: Int
    private let scheduler: PyreonScheduler
    private var token: Int?
    private var pending: A?

    public init(delayMs: Int, scheduler: PyreonScheduler = TaskScheduler(), action: @escaping (A) -> Void = { _ in }) {
        self.action = action
        self.delayMs = delayMs
        self.scheduler = scheduler
    }

    /// Schedule a call, replacing any pending one — so a burst collapses to
    /// the LAST arguments rather than firing per call.
    public func callAsFunction(_ arg: A) {
        if let t = token { scheduler.cancel(t) }
        pending = arg
        token = scheduler.schedule(after: delayMs) { [weak self] in
            guard let self, let p = self.pending else { return }
            self.token = nil
            self.pending = nil
            self.action(p)
        }
    }

    /// Drop the pending call entirely.
    public func cancel() {
        if let t = token { scheduler.cancel(t) }
        token = nil
        pending = nil
    }

    /// Fire the pending call NOW. A no-op when nothing is pending, and it
    /// clears the timer so the call cannot also land when the delay elapses.
    public func flush() {
        guard let p = pending else { return }
        if let t = token { scheduler.cancel(t) }
        token = nil
        pending = nil
        action(p)
    }
}

/// Leading-edge-plus-trailing throttle over a single-argument callback.
///
/// Modelled as a WINDOW rather than a clock. The web version compares
/// `Date.now()` against the last invocation, which would make this port
/// either untestable without real waiting or dependent on a fake clock whose
/// advance rate is its own source of divergence. A window is observably
/// identical and needs neither:
///
///   - no window open  → invoke now (the leading edge), open one
///   - window open     → remember the LATEST args
///   - window closes   → if args are pending, invoke them (the trailing
///                       edge) and open a fresh window, exactly as the web
///                       version's post-invoke `lastCallTime` update does
public final class PyreonThrottled<A> {
    /// See PyreonDebounced.action.
    public var action: (A) -> Void
    private let waitMs: Int
    private let scheduler: PyreonScheduler
    private var token: Int?
    private var pending: A?

    public init(waitMs: Int, scheduler: PyreonScheduler = TaskScheduler(), action: @escaping (A) -> Void = { _ in }) {
        self.action = action
        self.waitMs = waitMs
        self.scheduler = scheduler
    }

    public func callAsFunction(_ arg: A) {
        if token == nil {
            action(arg)
            openWindow()
            return
        }
        pending = arg
    }

    /// Drop the trailing call AND close the window, so the next call leads
    /// again rather than waiting the original one out.
    public func cancel() {
        if let t = token { scheduler.cancel(t) }
        token = nil
        pending = nil
    }

    private func openWindow() {
        token = scheduler.schedule(after: waitMs) { [weak self] in
            guard let self else { return }
            self.token = nil
            guard let p = self.pending else { return }
            self.pending = nil
            self.action(p)
            // A trailing invoke starts its own window, matching the web
            // version updating lastCallTime when it fires.
            self.openWindow()
        }
    }
}
