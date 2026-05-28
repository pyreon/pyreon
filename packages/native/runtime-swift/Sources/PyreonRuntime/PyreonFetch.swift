// PyreonFetch — the SwiftUI side of Pyreon's cross-platform data-fetching
// story (Phase 4.1). Mirrors the web `useFetch` result contract:
//
//     { data, error, isPending, refetch }
//
// ## What this delivers
//
// An `@Observable` container holding the three reactive fields a data
// hook exposes — `data` (the decoded result, `nil` until loaded),
// `error` (the failure, `nil` on success), and `isPending` (true while a
// fetch is in flight) — plus `refetch()` to re-run the last fetch. A
// SwiftUI view reads these and re-renders as they change, exactly like
// the web `useFetch().data` / `.isPending` reads drive a re-render.
//
// ## Scope — state container, NOT the async orchestrator
//
// `PyreonFetch` owns the STATE MACHINE only: `run(fetcher)` flips
// `isPending` true, invokes the fetcher, and lands the result in `data`
// or the failure in `error`. The fetcher is INJECTED — the actual
// network call (URLSession + JSONDecoder) is supplied by the caller, or
// by the compiler-emitted harness that runs the fetch inside a SwiftUI
// `.task { }` (the natural mount-time-async primitive) and feeds the
// awaited result in.
//
// This split is deliberate:
//   - it keeps the runtime port dependency-light + synchronously
//     unit-testable (inject a stub fetcher, assert the state transitions)
//     without standing up a network;
//   - it mirrors the Kotlin `PyreonFetch` (coroutine-free state container
//     driven by the Compose `LaunchedEffect` harness) one-for-one, so the
//     two targets stay in lockstep;
//   - the async HTTP wiring (`loadURL`-style helper + the compiler emit
//     that calls it) is a follow-up that builds on this contract.
//
// ## Relationship to the PMTC compiler emit
//
// A later emit pass detects `const x = useFetch<T>('/url')` and emits a
// `PyreonFetch<T>` instance whose `.task { }` awaits the URLSession call
// and feeds it into `run`; `x.data` / `x.isPending` reads in the
// component body become `x.data` / `x.isPending` reads on this container.
// Until that lands, this is usable by hand-written SwiftUI code.

import Foundation
import Observation

/// Observable async-data container — the SwiftUI half of `useFetch`.
/// Generic over the decoded result type `T`.
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonFetch<T> {
    /// The decoded result, or `nil` before the first successful fetch.
    public private(set) var data: T?
    /// The most recent failure, or `nil` on success / before first fetch.
    public private(set) var error: Error?
    /// True while a fetch is in flight.
    public private(set) var isPending: Bool = false

    /// The last fetcher passed to `run`, retained so `refetch()` can
    /// re-invoke it. Excluded from observation — it isn't view state.
    @ObservationIgnored private var lastFetcher: (() throws -> T)?

    public init() {}

    /// Run `fetcher`, transitioning `isPending` → (`data` | `error`).
    /// Retains the fetcher so `refetch()` re-runs the same request.
    ///
    /// The fetcher is synchronous here by design — the caller / emitted
    /// harness performs the `await`ed network call and passes a closure
    /// that returns the already-resolved value (or throws). The container
    /// only owns the state machine. (Named `load`, not `run`, for parity
    /// with the Kotlin port — Kotlin's stdlib `run` scope function would
    /// shadow a member named `run`.)
    public func load(_ fetcher: @escaping () throws -> T) {
        lastFetcher = fetcher
        reload()
    }

    /// Re-run the last fetcher. No-op if `run` was never called.
    public func refetch() {
        reload()
    }

    private func reload() {
        guard let fetcher = lastFetcher else { return }
        isPending = true
        error = nil
        do {
            data = try fetcher()
        } catch let caught {
            error = caught
        }
        isPending = false
    }
}
