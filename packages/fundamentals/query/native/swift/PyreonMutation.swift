// PyreonMutation — the SwiftUI side of `useMutation`: a request made when
// something HAPPENS (a submit, a save), as opposed to `PyreonQuery`'s read at
// mount. Mirrors the web `useMutation` result contract:
//
//     m.mutate(vars)         // fire and forget — the state carries the outcome
//     m.mutateAsync(vars)    // the same, awaited: resolves the data, throws the failure
//     m.data / m.error       // the latest mutation's outcome (cleared when the next begins)
//     m.isPending / m.isSuccess / m.isError / m.isIdle / m.status
//     m.reset()              // back to idle
//
// ## Transport-agnostic on purpose
//
// The container owns the STATE MACHINE and the callback order; the request is
// an injected `operation`. The compiler builds the request at the CALL SITE —
// as an argument, so every runtime value (a typed email, a token) is read at
// the moment the web reads it, before the handler moves on — and passes it in
// as `input`, with the send + decode as `operation`. That keeps this file free
// of the base runtime's HTTP types (a co-located package cannot see them
// without `import PyreonRuntime`), unit-testable with a stub operation, and
// one-for-one with the Kotlin twin.
//
// ## Semantics (TanStack Query's MutationObserver, which the web wraps)
//
// - The LATEST call owns the state. Each `mutate` bumps a generation; an older
//   call that settles after a newer one started writes nothing and fires none
//   of its CALL-level callbacks — the stale-resolution class a slow first save
//   clobbering a fast second one would otherwise be.
// - Callback order: the `useMutation` options' `onSuccess` / `onError`, then
//   their `onSettled`, THEN the state update, then the call's own `onSuccess`
//   / `onError` and `onSettled` (latest call only).
// - Disposal: the container is captured WEAKLY by the task. When the view that
//   owns it goes away, nothing is written and no callback runs. The request
//   itself is NOT cancelled — a write the server may already have committed
//   must not be torn mid-flight — matching the web, where unmounting never
//   aborts a mutation. (The web does still run the options-level callbacks
//   after unmount; natively they are skipped, because they would act on the
//   state of a view that no longer exists.)

import Foundation
import Observation

/// The callbacks one layer (the `useMutation` options, or one `mutate` call) contributes.
public struct PyreonMutationCallbacks<T> {
    public var onSuccess: ((T) -> Void)?
    public var onError: ((Error) -> Void)?
    public var onSettled: ((T?, Error?) -> Void)?

    public init(
        onSuccess: ((T) -> Void)? = nil,
        onError: ((Error) -> Void)? = nil,
        onSettled: ((T?, Error?) -> Void)? = nil
    ) {
        self.onSuccess = onSuccess
        self.onError = onError
        self.onSettled = onSettled
    }
}

/// Observable mutation container — the SwiftUI half of `useMutation`.
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonMutation<T> {
    /// The latest successful mutation's result.
    public private(set) var data: T?
    /// The latest failed mutation's error.
    public private(set) var error: Error?
    /// `idle` → `pending` → `success` | `error`, as on the web.
    public private(set) var status: String = "idle"

    public var isIdle: Bool { status == "idle" }
    public var isPending: Bool { status == "pending" }
    public var isSuccess: Bool { status == "success" }
    public var isError: Bool { status == "error" }

    /// Which call owns the state; bumped by every `mutate` and by `reset`.
    @ObservationIgnored private var generation = 0

    public init() {}

    /// Back to idle. A call still in flight settles without writing anything.
    public func reset() {
        generation += 1
        data = nil
        error = nil
        status = "idle"
    }

    /// Fire-and-forget: the web's `mutate(vars, callbacks)`. `input` is the
    /// already-built request, so it holds the values of the moment of the call.
    public func mutate<R>(
        _ input: R,
        _ operation: @escaping (R) async throws -> T,
        options: PyreonMutationCallbacks<T> = PyreonMutationCallbacks(),
        call: PyreonMutationCallbacks<T> = PyreonMutationCallbacks()
    ) {
        let mine = begin()
        // Spelled through its module: an app's own `Task` model shares this module and would shadow it.
        _Concurrency.Task { @MainActor [weak self] in
            do {
                let value = try await operation(input)
                self?.succeed(value, mine, options: options, call: call)
            } catch let failure {
                self?.fail(failure, mine, options: options, call: call)
            }
        }
    }

    /// The web's `mutateAsync(vars, callbacks)`: the same state machine, with
    /// the result returned and a failure thrown to the awaiting caller.
    @discardableResult
    public func mutateAsync<R>(
        _ input: R,
        _ operation: @escaping (R) async throws -> T,
        options: PyreonMutationCallbacks<T> = PyreonMutationCallbacks(),
        call: PyreonMutationCallbacks<T> = PyreonMutationCallbacks()
    ) async throws -> T {
        let mine = begin()
        do {
            let value = try await operation(input)
            succeed(value, mine, options: options, call: call)
            return value
        } catch let failure {
            fail(failure, mine, options: options, call: call)
            throw failure
        }
    }

    // MARK: - State machine

    // TanStack's reducer clears `data` on `pending` and on `error`: a new
    // mutation's state never carries the previous one's result.
    private func begin() -> Int {
        generation += 1
        data = nil
        error = nil
        status = "pending"
        return generation
    }

    private func succeed(_ value: T, _ mine: Int, options: PyreonMutationCallbacks<T>, call: PyreonMutationCallbacks<T>) {
        options.onSuccess?(value)
        options.onSettled?(value, nil)
        guard mine == generation else { return }
        data = value
        error = nil
        status = "success"
        call.onSuccess?(value)
        call.onSettled?(value, nil)
    }

    private func fail(_ failure: Error, _ mine: Int, options: PyreonMutationCallbacks<T>, call: PyreonMutationCallbacks<T>) {
        options.onError?(failure)
        options.onSettled?(nil, failure)
        guard mine == generation else { return }
        data = nil
        error = failure
        status = "error"
        call.onError?(failure)
        call.onSettled?(nil, failure)
    }
}
