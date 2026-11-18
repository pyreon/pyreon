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
//     that calls it) builds on this contract.
//
// ## Relationship to the PMTC compiler emit
//
// The emit detects `const x = useFetch<T>('/url')` and emits a
// `PyreonFetch<T>` instance whose `.task { }` awaits the URLSession call
// and feeds it into `run`; `x.data` / `x.isPending` reads in the
// component body become `x.data` / `x.isPending` reads on this container.
// It is equally usable by hand-written SwiftUI code.

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

    /// The last fetcher passed to `load`, retained so `refetch()` can
    /// re-invoke it. Excluded from observation — it isn't view state.
    @ObservationIgnored private var lastFetcher: (() throws -> T)?
    /// The request the emitted `.task` harness registered through `run(_:)`;
    /// `refetch()` re-runs it. Without it a compiled `refetch()` was a silent
    /// no-op: the harness fetched inline and nothing kept the request.
    @ObservationIgnored private var asyncFetcher: (() async throws -> T)?
    /// Bumped by every async fetch: a response settles state only while its
    /// own generation is still the latest (a slow first response cannot
    /// overwrite a newer refetch).
    @ObservationIgnored private var generation = 0

    public init() {}

    // MARK: - Async-harness transitions
    //
    // The async path — the compiler-emitted `.task { }` that awaits the
    // real network call — drives the state machine through these three
    // explicit transitions, because a single synchronous `load(fetcher)`
    // can't model "await, THEN resolve OR reject":
    //
    //     .task {
    //         x.begin()
    //         do    { x.resolve(try await fetchAndDecode()) }
    //         catch { x.reject($0) }
    //     }

    /// Enter the in-flight state: `isPending` true, prior `error` cleared.
    public func begin() {
        isPending = true
        error = nil
    }

    /// Complete with a value: set `data`, clear `error`, end pending.
    public func resolve(_ value: T) {
        data = value
        error = nil
        isPending = false
    }

    /// Complete with a failure: set `error`, end pending. Leaves any prior
    /// `data` in place (stale-while-error), matching the web contract.
    public func reject(_ failure: Error) {
        error = failure
        isPending = false
    }

    /// Run a SYNCHRONOUS `fetcher`, driving `begin` → (`resolve` | `reject`).
    /// Retains the fetcher so `refetch()` re-runs the same request. The
    /// async path uses `begin`/`resolve`/`reject` directly (above); `load`
    /// is the convenience for synchronous / test fetchers. (Named `load`,
    /// not `run`, for parity with the Kotlin port — Kotlin's stdlib `run`
    /// scope function would shadow a member named `run`.)
    public func load(_ fetcher: @escaping () throws -> T) {
        lastFetcher = fetcher
        reload()
    }

    /// Register the request and fetch it. The compiler-emitted `.task`
    /// harness calls this with the request it builds; the container keeps it
    /// so `refetch()` re-runs the same request (reading current values of
    /// anything the closure reads).
    @MainActor
    public func run(_ fetcher: @escaping () async throws -> T) async {
        asyncFetcher = fetcher
        await fetch(fetcher)
    }

    /// Re-run the registered request: the async one from `run`, else the
    /// last synchronous `load` fetcher. A no-op before either. Returns the
    /// running task for the async path so a caller can await it; emitted
    /// code ignores it.
    @discardableResult
    public func refetch() -> _Concurrency.Task<Void, Never>? {
        if let fetcher = asyncFetcher {
            return _Concurrency.Task { @MainActor [weak self] in
                await self?.fetch(fetcher)
            }
        }
        reload()
        return nil
    }

    @MainActor
    private func fetch(_ fetcher: () async throws -> T) async {
        generation += 1
        let mine = generation
        begin()
        do {
            let value = try await fetcher()
            guard mine == generation else { return } // superseded by a newer fetch
            resolve(value)
        } catch let failure {
            guard mine == generation else { return }
            if _Concurrency.Task.isCancelled {
                // The view went away: not a failure to show.
                isPending = false
            } else {
                reject(failure)
            }
        }
    }

    private func reload() {
        guard let fetcher = lastFetcher else { return }
        begin()
        do {
            resolve(try fetcher())
        } catch let caught {
            reject(caught)
        }
    }
}
