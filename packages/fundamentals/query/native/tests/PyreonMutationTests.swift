// Smoke tests for PyreonMutation — the `useMutation` state machine and
// TanStack's callback order, the Swift twin of PyreonMutationTest.kt.

import Foundation

private struct Boom: Error {}

@available(iOS 17.0, macOS 14.0, *)
@MainActor
func runPyreonMutationTests() async {
    // Success: options callbacks BEFORE the state update, the call's after it.
    do {
        let m = PyreonMutation<String>()
        precondition(m.isIdle && m.status == "idle", "starts idle")
        var log: [String] = []
        let value = try? await m.mutateAsync(
            "req",
            { r in "ok:\(r)" },
            options: PyreonMutationCallbacks(
                onSuccess: { log.append("options.onSuccess:\($0):\(m.status)") },
                onSettled: { d, e in log.append("options.onSettled:\(d ?? "nil"):\(e == nil)") }
            ),
            call: PyreonMutationCallbacks(
                onSuccess: { log.append("call.onSuccess:\($0):\(m.status)") },
                onSettled: { d, _ in log.append("call.onSettled:\(d ?? "nil")") }
            )
        )
        precondition(value == "ok:req" && m.isSuccess && m.data == "ok:req", "success state")
        precondition(
            log == [
                "options.onSuccess:ok:req:pending",
                "options.onSettled:ok:req:true",
                "call.onSuccess:ok:req:success",
                "call.onSettled:ok:req",
            ],
            "callback order: \(log)"
        )
    }
    // Failure: mutateAsync throws to the caller and records the error.
    do {
        let m = PyreonMutation<Int>()
        var errors = 0
        do {
            _ = try await m.mutateAsync((), { _ in throw Boom() }, options: PyreonMutationCallbacks(onError: { _ in errors += 1 }))
            preconditionFailure("must throw")
        } catch {
            precondition(error is Boom, "rethrows the failure")
        }
        precondition(m.isError && m.data == nil && errors == 1, "error state + options.onError")
    }
    // Fire-and-forget mutate: the state settles on its own Task.
    do {
        let m = PyreonMutation<Int>()
        m.mutate(5, { v in v * 2 })
        precondition(m.isPending, "mutate begins synchronously")
        for _ in 0..<100 where !m.isSuccess { await Task.yield() }
        precondition(m.data == 10, "mutate settled to 10, got \(String(describing: m.data))")
    }
    // A slow first call settling after a newer one began writes nothing.
    do {
        let m = PyreonMutation<String>()
        var stale = 0
        var fresh = 0
        m.mutate("a", { r in
            try await Task.sleep(nanoseconds: 50_000_000)
            return r
        }, call: PyreonMutationCallbacks(onSuccess: { _ in stale += 1 }))
        m.mutate("b", { r in r }, call: PyreonMutationCallbacks(onSuccess: { _ in fresh += 1 }))
        try? await Task.sleep(nanoseconds: 200_000_000)
        precondition(m.data == "b" && fresh == 1 && stale == 0, "newest call owns the state")
    }
    // The container is held WEAKLY by its task: once the owner releases it, nothing runs.
    do {
        var fired = 0
        var m: PyreonMutation<Int>? = PyreonMutation<Int>()
        m?.mutate(1, { v in
            try await Task.sleep(nanoseconds: 50_000_000)
            return v
        }, options: PyreonMutationCallbacks(onSuccess: { _ in fired += 1 }))
        m = nil
        try? await Task.sleep(nanoseconds: 200_000_000)
        precondition(fired == 0, "a released container runs no callback")
    }
    print("[PyreonMutationTests] all smoke tests passed")
}
