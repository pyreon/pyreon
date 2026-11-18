// Executable checks for PyreonFetch (the container behind `useFetch`): the emitted `.task` harness REGISTERS its
// request through `run(_:)`, so `refetch()` re-runs it. Before, the harness fetched inline (`begin()` …
// `resolve(…)`) and a compiled `refetch()` was a silent no-op.
//
// NOT @main: this directory's single @main (PyreonBluetoothTests) calls `runAll()`.

import Foundation

@available(iOS 17.0, macOS 14.0, *)
enum PyreonFetchTests {
    static func expect(_ cond: Bool, _ what: String) {
        if !cond {
            FileHandle.standardError.write("FAIL: PyreonFetch: \(what)\n".data(using: .utf8)!)
            exit(1)
        }
    }

    /// Run an async block to completion on the main actor, spinning the main run loop (a CLI `main` has no other).
    static func block(_ body: @escaping @MainActor () async -> Void) {
        var done = false
        _Concurrency.Task { @MainActor in
            await body()
            done = true
        }
        let deadline = Date().addingTimeInterval(10)
        while !done && Date() < deadline { RunLoop.main.run(until: Date().addingTimeInterval(0.005)) }
        expect(done, "async block finished")
    }

    static func runAll() {
        refetchReRunsTheRegisteredRequest()
        refetchRecoversFromAFailure()
        slowFirstResponseCannotOverwriteRefetch()
    }

    static func refetchReRunsTheRegisteredRequest() {
        block {
            var calls = 0
            let f = PyreonFetch<Int>()
            await f.run { calls += 1; return calls }
            expect(f.data == 1, "run fetched")
            await f.refetch()?.value
            expect(calls == 2, "refetch re-ran the registered request")
            expect(f.data == 2, "refetch replaced data")
            expect(!f.isPending, "refetch settled")
        }
    }

    static func refetchRecoversFromAFailure() {
        block {
            struct Down: Error {}
            var fail = true
            let f = PyreonFetch<Int>()
            await f.run { if fail { throw Down() }; return 5 }
            expect(f.error != nil, "a failed request records error")
            fail = false
            await f.refetch()?.value
            expect(f.data == 5, "refetch recovered")
            expect(f.error == nil, "refetch cleared the error")
        }
    }

    static func slowFirstResponseCannotOverwriteRefetch() {
        block {
            var parked: [CheckedContinuation<Int, Never>] = []
            let f = PyreonFetch<Int>()
            let first = _Concurrency.Task { @MainActor in
                await f.run { await withCheckedContinuation { parked.append($0) } }
            }
            while parked.count < 1 { await _Concurrency.Task.yield() }
            let second = f.refetch()
            while parked.count < 2 { await _Concurrency.Task.yield() }
            parked[1].resume(returning: 2)
            await second?.value
            expect(f.data == 2, "the newer response lands")
            parked[0].resume(returning: 1)
            await first.value
            expect(f.data == 2, "a SLOW first response must not overwrite the newer one")
        }
    }
}
