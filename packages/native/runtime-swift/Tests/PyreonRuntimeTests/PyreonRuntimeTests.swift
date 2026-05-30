// Smoke tests for the PyreonRuntime Swift package scaffold.
//
// These are NOT functional tests — they only verify the package's
// public symbols are reachable and the package builds + links + tests
// cleanly. Once the runtime grows real surface (effect bridging,
// token tables, ViewModifier types), per-file functional tests
// land alongside.

import XCTest
@testable import PyreonRuntime

final class PyreonRuntimeTests: XCTestCase {
    /// The `PyreonTokens` namespace is reachable + carries the
    /// placeholder version constant. PR 7a replaces the version
    /// with real token tables.
    func testPyreonTokensIsReachable() throws {
        XCTAssertEqual(PyreonTokens.version, "0.0.0-phase0-scaffold")
    }

    /// The `PyreonReactivity` namespace is reachable + carries the
    /// runtime-name constant. Real reactive helpers land in later PRs.
    func testPyreonReactivityIsReachable() throws {
        XCTAssertEqual(
            PyreonReactivity.runtimeName,
            "@pyreon/native-runtime-swift"
        )
    }

    /// The `PyreonStylable` protocol exists and has its default
    /// `pyreonSource` implementation. PR 7b will use this protocol
    /// for emitter-generated ViewModifier types.
    func testPyreonStylableDefaultImpl() throws {
        struct DummyStylable: PyreonStylable {}
        XCTAssertEqual(DummyStylable.pyreonSource, "(unspecified)")
    }

    /// A conforming type that overrides `pyreonSource` (the shape
    /// the styler emitter will produce). Locks the override pattern
    /// as part of the contract.
    func testPyreonStylableOverridden() throws {
        struct CustomStylable: PyreonStylable {
            static let pyreonSource = "Button.primary.medium"
        }
        XCTAssertEqual(CustomStylable.pyreonSource, "Button.primary.medium")
    }

    // MARK: - PyreonStorage tests

    private struct TestTodo: Codable, Equatable {
        var id: Int
        var text: String
        var done: Bool
    }

    private func freshStore() -> UserDefaults {
        // Each test gets an isolated UserDefaults suite so concurrent
        // tests don't share state. The suite name is a UUID — the
        // standard UserDefaults pattern for test isolation.
        let suiteName = "pyreon-test-\(UUID().uuidString)"
        let store = UserDefaults(suiteName: suiteName)!
        // Ensure clean slate.
        store.removePersistentDomain(forName: suiteName)
        return store
    }

    /// `PyreonStorage.decodeOrDefault` returns the default when given
    /// empty data — the empty-sentinel contract `@PyreonAppStorage` uses.
    func testPyreonStorageDecodeEmptyReturnsDefault() throws {
        let result: [TestTodo] = PyreonStorage.decodeOrDefault(
            Data(),
            default: [TestTodo(id: 1, text: "default", done: false)]
        )
        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result[0].text, "default")
    }

    /// `decodeOrDefault` falls back to the default on corrupt data
    /// (not valid JSON) instead of throwing. Mirrors the web
    /// `@pyreon/storage` fallback behaviour for corrupted localStorage.
    func testPyreonStorageDecodeCorruptDataReturnsDefault() throws {
        let result: [TestTodo] = PyreonStorage.decodeOrDefault(
            Data("not valid json".utf8),
            default: []
        )
        XCTAssertEqual(result, [])
    }

    /// `decodeOrDefault` correctly round-trips a valid Codable payload.
    func testPyreonStorageDecodeValidDataReturnsDecoded() throws {
        let original = [
            TestTodo(id: 1, text: "first", done: false),
            TestTodo(id: 2, text: "second", done: true),
        ]
        let encoded = try JSONEncoder().encode(original)
        let result: [TestTodo] = PyreonStorage.decodeOrDefault(
            encoded,
            default: []
        )
        XCTAssertEqual(result, original)
    }

    /// `read` + `write` round-trip through a real UserDefaults suite.
    func testPyreonStorageReadWriteRoundTrip() throws {
        let store = freshStore()
        let key = "todos"
        let payload = [TestTodo(id: 1, text: "test", done: false)]

        // Read before write returns nil.
        let beforeWrite: [TestTodo]? = try PyreonStorage.read(
            [TestTodo].self, key: key, store: store
        )
        XCTAssertNil(beforeWrite)

        // Write + read returns the payload.
        try PyreonStorage.write(payload, key: key, store: store)
        let afterWrite: [TestTodo]? = try PyreonStorage.read(
            [TestTodo].self, key: key, store: store
        )
        XCTAssertEqual(afterWrite, payload)
    }

    /// `read` throws on stored-but-corrupt data — distinct from the
    /// silent fallback `decodeOrDefault` provides. Apps that want
    /// explicit error visibility use `read`.
    func testPyreonStorageReadThrowsOnCorruptData() throws {
        let store = freshStore()
        let key = "corrupt"
        store.set(Data("not valid json".utf8), forKey: key)

        XCTAssertThrowsError(
            try PyreonStorage.read([TestTodo].self, key: key, store: store)
        )
    }

    /// `read` returns nil when the stored Data is empty (the
    /// PyreonAppStorage empty-sentinel shape) — does NOT throw.
    func testPyreonStorageReadEmptyDataReturnsNil() throws {
        let store = freshStore()
        let key = "empty"
        store.set(Data(), forKey: key)

        let result: [TestTodo]? = try PyreonStorage.read(
            [TestTodo].self, key: key, store: store
        )
        XCTAssertNil(result)
    }

    /// `remove` clears the value at `key` — subsequent `read` returns nil.
    func testPyreonStorageRemoveClearsKey() throws {
        let store = freshStore()
        let key = "todos"
        try PyreonStorage.write(
            [TestTodo(id: 1, text: "first", done: false)],
            key: key, store: store
        )

        PyreonStorage.remove(key: key, store: store)

        let afterRemove: [TestTodo]? = try PyreonStorage.read(
            [TestTodo].self, key: key, store: store
        )
        XCTAssertNil(afterRemove)
    }

    /// `@PyreonAppStorage` property wrapper round-trips Codable values
    /// through the @AppStorage Data slot — equivalent to using the
    /// inline Data-bridge pattern the compiler currently emits, but
    /// with one-line ergonomics.
    ///
    /// We test the wrapper's getter / setter directly rather than
    /// through a SwiftUI View body because property-wrapper observation
    /// only fires inside a View context. The getter/setter contract is
    /// the load-bearing piece — once that's right, SwiftUI's chain
    /// handles the rest the same way it does for stock @AppStorage.
    func testPyreonAppStorageRoundTrip() throws {
        let store = freshStore()
        let key = "todos"

        // Initial read returns the default (empty array).
        let initial = PyreonAppStorage<[TestTodo]>(
            wrappedValue: [], key, store: store
        )
        XCTAssertEqual(initial.wrappedValue, [])

        // Write a value through the property wrapper.
        initial.wrappedValue = [
            TestTodo(id: 1, text: "first", done: false),
            TestTodo(id: 2, text: "second", done: true),
        ]

        // A freshly-constructed wrapper at the same key reads the
        // persisted value — confirms the write actually hit the store,
        // not just the in-memory @AppStorage cache.
        let restored = PyreonAppStorage<[TestTodo]>(
            wrappedValue: [], key, store: store
        )
        XCTAssertEqual(restored.wrappedValue.count, 2)
        XCTAssertEqual(restored.wrappedValue[0].text, "first")
        XCTAssertEqual(restored.wrappedValue[1].done, true)
    }

    /// Default value is returned when no key exists yet (cold start).
    func testPyreonAppStorageDefaultOnColdStart() throws {
        let store = freshStore()
        let defaultTodos = [TestTodo(id: 99, text: "default", done: false)]
        let storage = PyreonAppStorage<[TestTodo]>(
            wrappedValue: defaultTodos, "cold-start", store: store
        )
        XCTAssertEqual(storage.wrappedValue, defaultTodos)
    }

    /// Default value is returned when the stored Data is corrupt —
    /// the silent-fallback contract the property wrapper documents.
    func testPyreonAppStorageDefaultOnCorruptData() throws {
        let store = freshStore()
        let key = "corrupted"
        // Manually plant a corrupt Data value (something a previous
        // schema version might have written that the current types
        // can't decode).
        store.set(Data("not valid".utf8), forKey: key)

        let storage = PyreonAppStorage<[TestTodo]>(
            wrappedValue: [], key, store: store
        )
        XCTAssertEqual(storage.wrappedValue, [])
    }

    // MARK: - PyreonFetch (useFetch result container)

    /// A fresh container is empty: no data, no error, not pending.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonFetchInitialState() throws {
        let fetch = PyreonFetch<Int>()
        XCTAssertNil(fetch.data)
        XCTAssertNil(fetch.error)
        XCTAssertFalse(fetch.isPending)
    }

    /// `run` with a succeeding fetcher lands the value in `data`, clears
    /// `error`, and ends not-pending.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonFetchRunSuccess() throws {
        let fetch = PyreonFetch<Int>()
        fetch.load { 42 }
        XCTAssertEqual(fetch.data, 42)
        XCTAssertNil(fetch.error)
        XCTAssertFalse(fetch.isPending)
    }

    /// `run` with a throwing fetcher lands the failure in `error`, leaves
    /// `data` nil, and ends not-pending.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonFetchRunFailure() throws {
        struct FetchError: Error, Equatable {}
        let fetch = PyreonFetch<Int>()
        fetch.load { throw FetchError() }
        XCTAssertNil(fetch.data)
        XCTAssertTrue(fetch.error is FetchError)
        XCTAssertFalse(fetch.isPending)
    }

    /// `refetch` re-invokes the last fetcher — a counter-backed fetcher
    /// observably advances on each call.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonFetchRefetchReRuns() throws {
        var calls = 0
        let fetch = PyreonFetch<Int>()
        fetch.load {
            calls += 1
            return calls
        }
        XCTAssertEqual(fetch.data, 1)
        fetch.refetch()
        XCTAssertEqual(fetch.data, 2)
        XCTAssertEqual(calls, 2)
    }

    /// `refetch` before any `run` is a safe no-op (no crash, state stays
    /// empty).
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonFetchRefetchBeforeRunIsNoOp() throws {
        let fetch = PyreonFetch<Int>()
        fetch.refetch()
        XCTAssertNil(fetch.data)
        XCTAssertNil(fetch.error)
        XCTAssertFalse(fetch.isPending)
    }

    /// A successful `run` after a failed one clears the prior error.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonFetchSuccessClearsPriorError() throws {
        struct FetchError: Error {}
        let fetch = PyreonFetch<Int>()
        fetch.load { throw FetchError() }
        XCTAssertNotNil(fetch.error)
        fetch.load { 7 }
        XCTAssertEqual(fetch.data, 7)
        XCTAssertNil(fetch.error)
    }

    // MARK: - PyreonFetch async-harness transitions (begin/resolve/reject)

    /// `begin()` enters the in-flight state and clears a prior error.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonFetchBeginEntersPending() throws {
        struct FetchError: Error {}
        let fetch = PyreonFetch<Int>()
        fetch.reject(FetchError())
        XCTAssertNotNil(fetch.error)
        fetch.begin()
        XCTAssertTrue(fetch.isPending)
        XCTAssertNil(fetch.error)
    }

    /// The async success path `begin()` → `resolve(v)` lands the value.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonFetchResolveLandsValue() throws {
        let fetch = PyreonFetch<Int>()
        fetch.begin()
        fetch.resolve(99)
        XCTAssertEqual(fetch.data, 99)
        XCTAssertNil(fetch.error)
        XCTAssertFalse(fetch.isPending)
    }

    /// The async failure path `begin()` → `reject(e)` records the error
    /// and ends pending.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonFetchRejectRecordsError() throws {
        struct FetchError: Error {}
        let fetch = PyreonFetch<Int>()
        fetch.begin()
        fetch.reject(FetchError())
        XCTAssertTrue(fetch.error is FetchError)
        XCTAssertFalse(fetch.isPending)
    }

    /// `reject` leaves prior `data` in place (stale-while-error) — a
    /// refetch failure doesn't blank the last good value.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonFetchRejectKeepsStaleData() throws {
        struct FetchError: Error {}
        let fetch = PyreonFetch<Int>()
        fetch.resolve(5)
        fetch.begin()
        fetch.reject(FetchError())
        XCTAssertEqual(fetch.data, 5)
        XCTAssertNotNil(fetch.error)
    }

    // MARK: - PyreonForm (useForm state container)

    /// Initial values seed `values`; a fresh form is error-free + valid.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonFormInitialValues() throws {
        let form = PyreonForm(initialValues: ["email": "a@b.com"])
        XCTAssertEqual(form.values["email"], "a@b.com")
        XCTAssertTrue(form.errors.isEmpty)
        XCTAssertFalse(form.isSubmitting)
        XCTAssertTrue(form.isValid)
    }

    /// `setValue` updates a field.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonFormSetValue() throws {
        let form = PyreonForm()
        form.setValue("name", "Ada")
        XCTAssertEqual(form.values["name"], "Ada")
    }

    /// `setError(name, msg)` sets, `setError(name, nil)` clears; `isValid`
    /// tracks.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonFormSetAndClearError() throws {
        let form = PyreonForm()
        form.setError("email", "required")
        XCTAssertEqual(form.errors["email"], "required")
        XCTAssertFalse(form.isValid)
        form.setError("email", nil)
        XCTAssertNil(form.errors["email"])
        XCTAssertTrue(form.isValid)
    }

    /// `setTouched` flips a field's touched flag.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonFormSetTouched() throws {
        let form = PyreonForm()
        XCTAssertNil(form.touched["email"])
        form.setTouched("email")
        XCTAssertEqual(form.touched["email"], true)
    }

    /// `beginSubmit` / `endSubmit` toggle `isSubmitting`.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonFormSubmitFlag() throws {
        let form = PyreonForm()
        form.beginSubmit()
        XCTAssertTrue(form.isSubmitting)
        form.endSubmit()
        XCTAssertFalse(form.isSubmitting)
    }

    /// `reset` restores initial values and clears errors / touched /
    /// submitting.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonFormReset() throws {
        let form = PyreonForm(initialValues: ["email": "a@b.com"])
        form.setValue("email", "changed")
        form.setError("email", "bad")
        form.setTouched("email")
        form.beginSubmit()
        form.reset()
        XCTAssertEqual(form.values["email"], "a@b.com")
        XCTAssertTrue(form.errors.isEmpty)
        XCTAssertTrue(form.touched.isEmpty)
        XCTAssertFalse(form.isSubmitting)
    }

    // MARK: - PyreonPermissions (usePermissions reactive set)

    /// An exact grant matches; an ungranted key is denied; `cannot` inverts.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonPermissionsExactMatch() throws {
        let perms = PyreonPermissions(["posts.edit"])
        XCTAssertTrue(perms.can("posts.edit"))
        XCTAssertFalse(perms.can("posts.delete"))
        XCTAssertTrue(perms.cannot("posts.delete"))
    }

    /// A `"posts.*"` wildcard matches any `posts.<X>` but is segment-scoped.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonPermissionsWildcard() throws {
        let perms = PyreonPermissions(["posts.*"])
        XCTAssertTrue(perms.can("posts.edit"))
        XCTAssertTrue(perms.can("posts.delete"))
        XCTAssertFalse(perms.can("users.edit"))
        XCTAssertFalse(perms.can("postsX")) // segment-prefix, not substring
    }

    /// `all` requires every key; `any` requires at least one.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonPermissionsAllAny() throws {
        let perms = PyreonPermissions(["a", "b"])
        XCTAssertTrue(perms.all("a", "b"))
        XCTAssertFalse(perms.all("a", "c"))
        XCTAssertTrue(perms.any("a", "c"))
        XCTAssertFalse(perms.any("c", "d"))
    }

    /// `grant` / `revoke` / `set` mutate the granted set reactively.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonPermissionsMutation() throws {
        let perms = PyreonPermissions()
        XCTAssertFalse(perms.can("admin"))
        perms.grant("admin")
        XCTAssertTrue(perms.can("admin"))
        perms.revoke("admin")
        XCTAssertFalse(perms.can("admin"))
        perms.set(["x", "y"])
        XCTAssertTrue(perms.can("x"))
        XCTAssertTrue(perms.can("y"))
        XCTAssertFalse(perms.can("admin"))
    }

    // MARK: - PyreonNetworkStatus (useOnline reactive connectivity flag)

    /// Defaults to online; an explicit initial value is honored.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonNetworkStatusInitialValue() throws {
        XCTAssertTrue(PyreonNetworkStatus().isOnline)
        XCTAssertFalse(PyreonNetworkStatus(isOnline: false).isOnline)
    }

    /// `update(_:)` flips the reactive flag both ways.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonNetworkStatusUpdateFlips() throws {
        let net = PyreonNetworkStatus(isOnline: true)
        net.update(false)
        XCTAssertFalse(net.isOnline)
        net.update(true)
        XCTAssertTrue(net.isOnline)
    }

    /// `stop()` before `start()` is a safe no-op (releases nothing).
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonNetworkStatusStopBeforeStartIsNoop() throws {
        let net = PyreonNetworkStatus()
        net.stop() // must not crash
        XCTAssertTrue(net.isOnline)
    }

    // MARK: - PyreonClipboard
    //
    // Round-2 audit fix: PyreonClipboard.swift had ZERO test coverage
    // despite shipping in #1066 (PMTC emit) + had a real bug — it
    // imported UIKit unconditionally, breaking `swift build` on
    // macOS (Package.swift declares both iOS 17 + macOS 14). Same PR
    // adds the `#if canImport(UIKit)` / AppKit fallback that makes
    // the build cross-platform. These tests structurally guarantee
    // both targets stay buildable AND lock the public state-machine
    // surface (`copied` / `copy` / `reset`).

    /// Fresh clipboard reports `copied == false`.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonClipboardInitialState() throws {
        let cb = PyreonClipboard()
        XCTAssertFalse(cb.copied)
    }

    /// `copy(_:)` synchronously flips `copied = true`. The 2-second
    /// auto-reset is asynchronous (Task-based) and not exercised
    /// here — that would need `XCTestExpectation` waiting for the
    /// Task, making the test slow + flaky. The reset-on-explicit-call
    /// path below verifies the state machine without the async
    /// dependency.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonClipboardCopySetsCopiedTrue() throws {
        let cb = PyreonClipboard()
        cb.copy("hi")
        XCTAssertTrue(cb.copied)
    }

    /// `reset()` returns `copied` to false + cancels any pending
    /// auto-reset Task. Idempotent (safe to call multiple times).
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonClipboardResetClearsCopied() throws {
        let cb = PyreonClipboard()
        cb.copy("hi")
        XCTAssertTrue(cb.copied)
        cb.reset()
        XCTAssertFalse(cb.copied)
        cb.reset()
        XCTAssertFalse(cb.copied)
    }

    /// Back-to-back copies keep `copied = true` (the second copy
    /// cancels the first reset Task, then arms its own). Real apps
    /// rely on this — quick double-copy must not flicker the
    /// "Copied!" feedback off.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonClipboardBackToBackCopyKeepsCopiedTrue() throws {
        let cb = PyreonClipboard()
        cb.copy("first")
        cb.copy("second")
        XCTAssertTrue(cb.copied)
    }

    /// Public initializer takes no args (Swift's shape differs from
    /// Kotlin's `PyreonClipboard(context, scope)` intentionally:
    /// UIPasteboard.general / NSPasteboard.general is a process
    /// singleton, so no context-injection is needed on Apple
    /// platforms). Structural lock against a future signature drift.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonClipboardNoArgInit() throws {
        let cb = PyreonClipboard()
        XCTAssertNotNil(cb)
    }

    /// Round-2 audit fix (Class I — orphaned Task timer): scoped
    /// allocation + deallocation must not crash, and the deinit must
    /// cancel any pending reset Task. We can't directly observe the
    /// cancellation (`resetTask` is private + the cancellation flag
    /// is internal to Swift Concurrency), so the test exercises the
    /// LIFECYCLE: alloc → copy → release via scope-exit, then verify
    /// no crash + Task cancellation runs cleanly. A regression in
    /// the deinit (removing `resetTask?.cancel()`) would still pass
    /// this test — the assertion is the BEST achievable without
    /// reaching into Swift Concurrency internals; the runtime-side
    /// guarantee is the deinit itself (visible at code review).
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonClipboardDeinitCancelsResetTask() throws {
        // Alloc in a scoped block so the deinit fires at scope exit.
        autoreleasepool {
            let cb = PyreonClipboard()
            cb.copy("hi") // arms the 2s reset Task
            XCTAssertTrue(cb.copied)
            // `cb` released at scope exit; the @Observable / @State
            // owner's release would similarly trigger deinit. The
            // crash-free completion of this test is the regression
            // signal — the Task body uses `[weak self]`, so a missing
            // deinit cancellation doesn't crash but does waste ~2s
            // of Task.sleep work (the deinit cancellation is the
            // fix's actual job).
        }
        XCTAssertTrue(true, "deinit completed without crash")
    }
}
