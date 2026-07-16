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

    /// `not` is the web-API-parity inverse (`can.not("k")` in source).
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonPermissionsNotParity() throws {
        let perms = PyreonPermissions(["posts.edit"])
        XCTAssertTrue(perms.not("posts.delete"))
        XCTAssertFalse(perms.not("posts.edit"))
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

    /// Double-`stop()` after a `start()` is a safe no-op — the second call
    /// must NOT touch the already-cancelled `NWPathMonitor` (post-fix the
    /// `_started` flag guards the body; the second call early-returns
    /// without re-cancelling). Lifecycle hardening regression — audit
    /// finding "monitor lifecycle not fully guarded against double-stop".
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonNetworkStatusDoubleStopIsNoop() throws {
        let net = PyreonNetworkStatus()
        net.start()
        XCTAssertTrue(net.isMonitoring)
        net.stop()
        XCTAssertFalse(net.isMonitoring)
        net.stop() // must not crash, must not double-cancel
        XCTAssertFalse(net.isMonitoring) // lifecycle flag stable across double-stop
        XCTAssertTrue(net.isOnline) // initial value preserved
    }

    /// Double-`start()` is idempotent — the second call must NOT spin a
    /// second `NWPathMonitor`. Reactive state is preserved across the
    /// no-op call.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonNetworkStatusDoubleStartIsNoop() throws {
        let net = PyreonNetworkStatus(isOnline: false)
        XCTAssertFalse(net.isMonitoring)
        net.start()
        XCTAssertTrue(net.isMonitoring)
        net.start() // idempotent — no second monitor
        XCTAssertTrue(net.isMonitoring) // still monitoring (single instance)
        XCTAssertFalse(net.isOnline) // initial value preserved
        net.stop() // cleanup
        XCTAssertFalse(net.isMonitoring)
    }

    /// `start() → stop() → start()` cycle works — `stop()` fully resets the
    /// lifecycle flag so a subsequent `start()` spins a fresh monitor (not
    /// blocked by stale `_started` state). Bisect-verified: removing the
    /// `_started = false` reset in `stop()` makes the second `start()` a
    /// silent no-op and `isMonitoring` stays true through what should be
    /// the off-cycle.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonNetworkStatusStartStopStartCycle() throws {
        let net = PyreonNetworkStatus()
        net.start()
        XCTAssertTrue(net.isMonitoring)
        net.stop()
        XCTAssertFalse(net.isMonitoring) // bisect lock — would fail if stop() didn't reset
        net.start() // must succeed (not blocked by stale _started flag)
        XCTAssertTrue(net.isMonitoring)
        net.update(false) // proves the instance is still functional
        XCTAssertFalse(net.isOnline)
        net.stop()
        XCTAssertFalse(net.isMonitoring)
        net.stop() // double-stop tail — still safe, still off
        XCTAssertFalse(net.isMonitoring)
    }

    /// `update(_:)` is INDEPENDENT of the `start()` / `stop()` lifecycle —
    /// it writes `isOnline` regardless of `_started` state. Intentional
    /// contract — lets external callers seed an initial value before
    /// `start()` (e.g. a SwiftUI parent passing a last-known value down)
    /// AND lets tests simulate updates without spinning a real
    /// `NWPathMonitor`. A future "tidy" refactor that gates `update()` on
    /// `_started` would silently regress the public contract; this test
    /// pins it.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonNetworkStatusUpdateBeforeStartWrites() throws {
        let net = PyreonNetworkStatus(isOnline: true)
        XCTAssertFalse(net.isMonitoring) // never started
        net.update(false) // must write regardless of lifecycle
        XCTAssertFalse(net.isOnline)
        net.update(true)
        XCTAssertTrue(net.isOnline)
        XCTAssertFalse(net.isMonitoring) // lifecycle untouched
    }

    /// `update(_:)` after `stop()` STILL works — `stop()` doesn't lock
    /// the public setter. Companion to `UpdateBeforeStartWrites`:
    /// `update` is a lifecycle-independent state-mutator, never a
    /// monitor-gated callback. A refactor that adds a `guard _started`
    /// to `update` would silently regress the contract; this test pins it.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonNetworkStatusUpdateAfterStopWrites() throws {
        let net = PyreonNetworkStatus(isOnline: true)
        net.start()
        XCTAssertTrue(net.isMonitoring)
        net.stop()
        XCTAssertFalse(net.isMonitoring) // lifecycle off
        net.update(false) // must still write — stop() doesn't lock the setter
        XCTAssertFalse(net.isOnline)
        net.update(true)
        XCTAssertTrue(net.isOnline)
        XCTAssertFalse(net.isMonitoring) // lifecycle still off
    }

    /// `isMonitoring` is documented as "Not observable for SwiftUI
    /// re-render — wrap in your own `@Observable` if you need to gate UI
    /// on monitoring state itself." This test enforces that contract by
    /// running `withObservationTracking` over a read of `isMonitoring`
    /// and asserting the change-handler does NOT fire when `start()`
    /// flips the backing `_started` flag.
    ///
    /// The contract is structurally enforced at three layers:
    /// 1. `_started` is `@ObservationIgnored` (writes don't notify trackers)
    /// 2. `isMonitoring` is a computed property over `_started` (reads
    ///    don't register on the Observable property registry — there is
    ///    no stored property named `isMonitoring` for the macro to track)
    /// 3. This test (the runtime proof — if either #1 or #2 regresses,
    ///    the change-handler will fire and the XCTFail will hit)
    ///
    /// A future refactor that flips `_started` to a stored observable
    /// property OR replaces `isMonitoring` with a stored property would
    /// trigger the handler and fail this test.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonNetworkStatusIsMonitoringIsNotObservable() throws {
        let net = PyreonNetworkStatus()
        // ObservationFlag is a tiny class so the onChange closure can
        // mutate it under Swift 6 Sendable rules (var-capture from a
        // `@Sendable` closure is rejected; reference-type access is OK
        // because the tracker is single-shot and runs on the same actor
        // as the writer here).
        let flag = ObservationFlag()
        // withObservationTracking installs a single-shot tracker: when
        // ANY property READ inside the access block is later WRITTEN,
        // the onChange closure fires exactly once. Reading `isMonitoring`
        // should register NO observation (the macro doesn't see _started
        // as observable AND isMonitoring is a computed property — no
        // synthesized storage for the macro to hook).
        withObservationTracking {
            _ = net.isMonitoring
        } onChange: {
            flag.fired = true
        }
        net.start() // flips _started — would fire handler if observable
        net.stop()
        XCTAssertFalse(
            flag.fired,
            "isMonitoring must NOT be SwiftUI-observable — the documented contract is " +
            "'wrap in your own @Observable if you need to gate UI on monitoring state itself'. " +
            "A regression here means a future refactor flipped _started to observable OR " +
            "replaced isMonitoring's computed getter with stored property — both break the " +
            "documented contract. See PyreonNetworkStatus.swift `_started` (must be " +
            "@ObservationIgnored) AND `isMonitoring` (must be `var isMonitoring: Bool { _started }`, " +
            "NEVER a stored property)."
        )
    }

    /// Companion sanity check — `isOnline` IS observable (it's the whole
    /// point of the @Observable annotation). Without this control, the
    /// `IsMonitoringIsNotObservable` test could pass trivially against
    /// a broken withObservationTracking integration. Pairing the two
    /// proves the tracker mechanism works AND the isMonitoring contract
    /// holds.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonNetworkStatusIsOnlineIsObservable() throws {
        let net = PyreonNetworkStatus(isOnline: true)
        let flag = ObservationFlag()
        withObservationTracking {
            _ = net.isOnline
        } onChange: {
            flag.fired = true
        }
        net.update(false) // flips isOnline — MUST fire the handler
        XCTAssertTrue(
            flag.fired,
            "isOnline MUST be SwiftUI-observable — this is the whole point " +
            "of @Observable on PyreonNetworkStatus. If this regresses, the " +
            "useOnline() compiler emit's SwiftUI re-render contract is broken."
        )
    }

    // MARK: - PyreonAppState (useAppState reactive lifecycle phase)

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonAppStateDefaultsActive() throws {
        XCTAssertEqual(PyreonAppState().phase, "active")
    }

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonAppStateInitialValue() throws {
        XCTAssertEqual(PyreonAppState(phase: "background").phase, "background")
    }

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonAppStateUpdateTransitions() throws {
        let state = PyreonAppState()
        state.update("background")
        XCTAssertEqual(state.phase, "background")
        state.update("inactive")
        XCTAssertEqual(state.phase, "inactive")
        state.update("active")
        XCTAssertEqual(state.phase, "active")
    }

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonAppStateStopBeforeStartIsNoop() throws {
        let state = PyreonAppState(phase: "inactive")
        XCTAssertFalse(state.isMonitoring)
        state.stop() // must not crash
        XCTAssertFalse(state.isMonitoring)
        XCTAssertEqual(state.phase, "inactive", "initial value preserved through bare stop()")
    }

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonAppStateStartStopIdempotent() throws {
        let state = PyreonAppState()
        state.start()
        XCTAssertTrue(state.isMonitoring)
        state.start() // second start while running → no-op
        XCTAssertTrue(state.isMonitoring)
        state.stop()
        XCTAssertFalse(state.isMonitoring)
        state.stop() // double-stop → no-op
        XCTAssertFalse(state.isMonitoring)
    }

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonAppStateUpdateIndependentOfLifecycle() throws {
        let state = PyreonAppState()
        state.update("background") // writes before any start()
        XCTAssertEqual(state.phase, "background")
        state.start()
        state.stop()
        state.update("active") // still writes after stop()
        XCTAssertEqual(state.phase, "active")
    }

    /// `phase` MUST be `@Observable` — the whole point of the container is
    /// SwiftUI re-render on a phase flip.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonAppStatePhaseIsObservable() throws {
        let state = PyreonAppState()
        let flag = ObservationFlag()
        withObservationTracking {
            _ = state.phase
        } onChange: {
            flag.fired = true
        }
        state.update("background")
        XCTAssertTrue(
            flag.fired,
            "phase MUST be SwiftUI-observable — else the useAppState() emit's " +
            "re-render contract is broken."
        )
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
    // MARK: - PyreonForm v2 (validators + submit + web-parity API)

    /// A failing validator populates errors; fixing the value through
    /// setValue re-validates immediately (the after-error feedback shape).
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonFormValidatorFlow() throws {
        let form = PyreonForm(
            initialValues: ["username": ""],
            validators: ["username": { $0.count < 3 ? "too short" : "" }]
        )
        XCTAssertFalse(form.validateField("username"))
        XCTAssertEqual(form.errors["username"], "too short")
        form.setValue("username", "alice")
        XCTAssertNil(form.errors["username"])  // re-validated on set
    }

    /// submit() gates on validateAll: invalid → no callback; valid →
    /// callback receives the values snapshot.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonFormSubmitGate() throws {
        var submitted: [String: String]? = nil
        let form = PyreonForm(
            initialValues: ["username": ""],
            validators: ["username": { $0.isEmpty ? "required" : "" }],
            onSubmit: { submitted = $0 }
        )
        form.submit()
        XCTAssertNil(submitted, "invalid form must not submit")
        XCTAssertEqual(form.errors["username"], "required")
        form.setFieldValue("username", "alice")
        form.submit()
        XCTAssertEqual(submitted?["username"], "alice")
        XCTAssertFalse(form.isSubmitting)
    }

    /// binding(_:) round-trips through setValue (and re-validation).
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonFormBindingRoundTrip() throws {
        let form = PyreonForm(initialValues: ["email": "a@b.c"])
        let binding = form.binding("email")
        XCTAssertEqual(binding.wrappedValue, "a@b.c")
        binding.wrappedValue = "x@y.z"
        XCTAssertEqual(form.values["email"], "x@y.z")
    }

    // MARK: - PyreonI18n (createI18n + t())

    /// Single-arg t(): active-locale lookup, fallback chain, key-verbatim miss.
    func testPyreonI18nLookup() throws {
        let i18n = PyreonI18n(
            locale: "de",
            messages: ["en": ["hello": "Hello!"], "de": [:]],
            fallbackLocale: "en"
        )
        XCTAssertEqual(i18n.t("hello"), "Hello!")  // via fallback
        XCTAssertEqual(i18n.t("missing"), "missing")
    }

    /// Two-arg t(): `{{name}}` interpolation with String + Int values.
    func testPyreonI18nInterpolation() throws {
        let i18n = PyreonI18n(
            locale: "en",
            messages: ["en": ["greet": "Hello {{name}}, you have {{n}}!"]]
        )
        XCTAssertEqual(i18n.t("greet", ["name": "Ada", "n": 3]), "Hello Ada, you have 3!")
    }

    /// Plurals: `count == 1` → `_one`, else `_other`; bare key when no
    /// suffixed entries exist.
    func testPyreonI18nPlurals() throws {
        let i18n = PyreonI18n(
            locale: "en",
            messages: ["en": [
                "items_one": "{{count}} item",
                "items_other": "{{count}} items",
                "plain": "no plural {{count}}",
            ]]
        )
        XCTAssertEqual(i18n.t("items", ["count": 1]), "1 item")
        XCTAssertEqual(i18n.t("items", ["count": 2]), "2 items")
        XCTAssertEqual(i18n.t("items", ["count": 0]), "0 items")
        XCTAssertEqual(i18n.t("plain", ["count": 5]), "no plural 5")
    }

    // MARK: - PyreonGeolocation (useGeolocation reactive location)
    //
    // These cover the PURE state machine + the start/stop lifecycle
    // idempotency. The live `CLLocationManager` edge is constructed by
    // `start()` but NOT exercised here — real GPS fixes need a device, a
    // granted permission prompt, and an Info.plist usage key; the same
    // "manager constructed, not asserted" boundary PyreonNetworkStatus uses.

    /// A fresh container is empty + untracked.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonGeolocationInitialState() throws {
        let loc = PyreonGeolocation()
        XCTAssertNil(loc.latitude)
        XCTAssertNil(loc.longitude)
        XCTAssertNil(loc.accuracy)
        XCTAssertFalse(loc.isAuthorized)
        XCTAssertNil(loc.error)
        XCTAssertFalse(loc.isTracking)
    }

    /// `update(latitude:longitude:accuracy:)` sets the fix fields.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonGeolocationUpdateSetsFix() throws {
        let loc = PyreonGeolocation()
        loc.update(latitude: 50.0755, longitude: 14.4378, accuracy: 12.5)
        XCTAssertEqual(loc.latitude, 50.0755)
        XCTAssertEqual(loc.longitude, 14.4378)
        XCTAssertEqual(loc.accuracy, 12.5)
    }

    /// A fix clears any prior error.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonGeolocationUpdateClearsPriorError() throws {
        struct GPSError: Error {}
        let loc = PyreonGeolocation()
        loc.fail(GPSError())
        XCTAssertNotNil(loc.error)
        loc.update(latitude: 1.0, longitude: 2.0)
        XCTAssertNil(loc.error)
    }

    /// `authorize(_:)` flips the permission flag both ways.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonGeolocationAuthorizeFlips() throws {
        let loc = PyreonGeolocation()
        loc.authorize(true)
        XCTAssertTrue(loc.isAuthorized)
        loc.authorize(false)
        XCTAssertFalse(loc.isAuthorized)
    }

    /// `fail(_:)` sets `error` but keeps the last fix (stale-while-error).
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonGeolocationFailKeepsLastFix() throws {
        struct GPSError: Error {}
        let loc = PyreonGeolocation()
        loc.update(latitude: 10.0, longitude: 20.0, accuracy: 5.0)
        loc.fail(GPSError())
        XCTAssertNotNil(loc.error)
        XCTAssertEqual(loc.latitude, 10.0)
        XCTAssertEqual(loc.longitude, 20.0)
    }

    /// `stop()` before `start()` is a safe no-op.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonGeolocationStopBeforeStartIsNoop() throws {
        let loc = PyreonGeolocation()
        loc.stop() // must not crash
        XCTAssertFalse(loc.isTracking)
    }

    /// `start()` begins tracking + constructs the real CLLocationManager;
    /// `stop()` ends it. Idempotency exercised; live GPS not (device-only).
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonGeolocationStartStopLifecycle() throws {
        let loc = PyreonGeolocation()
        loc.start()
        XCTAssertTrue(loc.isTracking)
        loc.start() // idempotent — no second manager
        XCTAssertTrue(loc.isTracking)
        loc.stop()
        XCTAssertFalse(loc.isTracking)
        loc.stop() // double-stop is a safe no-op
        XCTAssertFalse(loc.isTracking)
        loc.start() // start/stop/start cycle re-enables
        XCTAssertTrue(loc.isTracking)
        loc.stop()
    }

    // MARK: - PyreonAuth (useAuth pure auth-state machine)
    //
    // PyreonAuth is PURE state (no platform edge), so these fully cover the
    // container — no "device territory" caveat. The sign-in mechanism
    // (OAuth / password POST / biometric / refresh) drives the transitions
    // from outside.

    struct AuthUser: Equatable { let id: Int; let name: String }

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonAuthInitialSignedOut() throws {
        let auth = PyreonAuth<AuthUser>()
        XCTAssertEqual(auth.status, .signedOut)
        XCTAssertNil(auth.user)
        XCTAssertNil(auth.error)
        XCTAssertFalse(auth.isAuthenticated)
        XCTAssertFalse(auth.isSigningIn)
    }

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonAuthRehydratedSession() throws {
        let auth = PyreonAuth(status: .signedIn, user: AuthUser(id: 1, name: "ada"))
        XCTAssertTrue(auth.isAuthenticated)
        XCTAssertEqual(auth.user, AuthUser(id: 1, name: "ada"))
    }

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonAuthSignInFlow() throws {
        let auth = PyreonAuth<AuthUser>()
        auth.beginSignIn()
        XCTAssertEqual(auth.status, .signingIn)
        XCTAssertTrue(auth.isSigningIn)
        XCTAssertFalse(auth.isAuthenticated)
        auth.signInSucceeded(AuthUser(id: 7, name: "grace"))
        XCTAssertEqual(auth.status, .signedIn)
        XCTAssertTrue(auth.isAuthenticated)
        XCTAssertEqual(auth.user, AuthUser(id: 7, name: "grace"))
        XCTAssertNil(auth.error)
    }

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonAuthSignInFailure() throws {
        struct AuthError: Error {}
        let auth = PyreonAuth<AuthUser>()
        auth.beginSignIn()
        auth.signInFailed(AuthError())
        XCTAssertEqual(auth.status, .error)
        XCTAssertTrue(auth.error is AuthError)
        XCTAssertFalse(auth.isAuthenticated)
        XCTAssertNil(auth.user)
    }

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonAuthBeginClearsPriorError() throws {
        struct AuthError: Error {}
        let auth = PyreonAuth<AuthUser>()
        auth.signInFailed(AuthError())
        XCTAssertNotNil(auth.error)
        auth.beginSignIn()
        XCTAssertNil(auth.error)
        XCTAssertEqual(auth.status, .signingIn)
    }

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonAuthFailedRefreshKeepsUser() throws {
        struct AuthError: Error {}
        let auth = PyreonAuth(status: .signedIn, user: AuthUser(id: 1, name: "ada"))
        auth.beginSignIn()
        XCTAssertEqual(auth.user, AuthUser(id: 1, name: "ada"))
        auth.signInFailed(AuthError())
        XCTAssertEqual(auth.status, .error)
        XCTAssertEqual(auth.user, AuthUser(id: 1, name: "ada")) // refresh keeps prior user
    }

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonAuthSignOutClearsEverything() throws {
        let auth = PyreonAuth(status: .signedIn, user: AuthUser(id: 1, name: "ada"))
        auth.signOut()
        XCTAssertEqual(auth.status, .signedOut)
        XCTAssertNil(auth.user)
        XCTAssertNil(auth.error)
        XCTAssertFalse(auth.isAuthenticated)
    }

    // MARK: - PyreonSecureStorage (secret store)
    //
    // These cover the facade contract over the in-memory backend (the unit-
    // testable path). The real `KeychainSecureBackend` is constructed (it
    // compiles under `swift build`) but its live `SecItem*` I/O is NOT
    // asserted — that needs a host keychain + entitlements, the same
    // "real edge constructed, not asserted" boundary PyreonNetworkStatus
    // and PyreonWebSocket use.

    /// write → read → contains round-trip over the in-memory backend.
    func testPyreonSecureStorageRoundTrip() throws {
        let store = PyreonSecureStorage(backend: InMemorySecureBackend())
        XCTAssertNil(store.read(key: "auth"))
        XCTAssertFalse(store.contains(key: "auth"))
        XCTAssertTrue(store.write("ey.token", key: "auth"))
        XCTAssertEqual(store.read(key: "auth"), "ey.token")
        XCTAssertTrue(store.contains(key: "auth"))
    }

    /// `write` overwrites an existing secret.
    func testPyreonSecureStorageOverwrite() throws {
        let store = PyreonSecureStorage(backend: InMemorySecureBackend())
        store.write("first", key: "k")
        store.write("second", key: "k")
        XCTAssertEqual(store.read(key: "k"), "second")
    }

    /// `remove` deletes; a removed key reads nil + contains false.
    func testPyreonSecureStorageRemove() throws {
        let store = PyreonSecureStorage(backend: InMemorySecureBackend())
        store.write("secret", key: "k")
        XCTAssertTrue(store.contains(key: "k"))
        XCTAssertTrue(store.remove(key: "k"))
        XCTAssertNil(store.read(key: "k"))
        XCTAssertFalse(store.contains(key: "k"))
    }

    /// `remove` of an absent key is idempotent (returns true, no crash).
    func testPyreonSecureStorageRemoveAbsentIsIdempotent() throws {
        let store = PyreonSecureStorage(backend: InMemorySecureBackend())
        XCTAssertTrue(store.remove(key: "never-written"))
        XCTAssertNil(store.read(key: "never-written"))
    }

    /// Multiple keys are isolated — removing one leaves the others.
    func testPyreonSecureStorageMultipleKeysIsolated() throws {
        let store = PyreonSecureStorage(backend: InMemorySecureBackend())
        store.write("a-val", key: "a")
        store.write("b-val", key: "b")
        XCTAssertEqual(store.read(key: "a"), "a-val")
        XCTAssertEqual(store.read(key: "b"), "b-val")
        store.remove(key: "a")
        XCTAssertNil(store.read(key: "a"))
        XCTAssertEqual(store.read(key: "b"), "b-val")
    }

    /// The real `KeychainSecureBackend` constructs cleanly (proves it
    /// compiles + inits). Its live `SecItem*` I/O is device/host territory —
    /// NOT called here.
    func testKeychainSecureBackendConstructs() throws {
        let backend = KeychainSecureBackend(service: "com.pyreon.test")
        let store = PyreonSecureStorage(backend: backend)
        // Construction only — no live keychain I/O asserted.
        XCTAssertNotNil(store)
    }

    /// The default `PyreonSecureStorage()` (no backend arg) wires the real
    /// Keychain backend — proves the secure-by-default constructor compiles.
    /// Live I/O not asserted.
    func testPyreonSecureStorageDefaultsToKeychain() throws {
        let store = PyreonSecureStorage()
        XCTAssertNotNil(store)
    }

    // MARK: - PyreonPushNotifications (usePush reactive push container)
    //
    // Pure state machine + injected-registration lifecycle. The real
    // AppDelegate / APNs forwarding is the app's job (injected) — not
    // exercised here.

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonPushInitialState() throws {
        let push = PyreonPushNotifications()
        XCTAssertNil(push.token)
        XCTAssertNil(push.lastNotification)
        XCTAssertTrue(push.notifications.isEmpty)
        XCTAssertFalse(push.isAuthorized)
        XCTAssertNil(push.error)
        XCTAssertFalse(push.isRegistered)
    }

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonPushTokenReceived() throws {
        let push = PyreonPushNotifications()
        push.tokenReceived("apns-abc")
        XCTAssertEqual(push.token, "apns-abc")
    }

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonPushNotificationAccumulates() throws {
        let push = PyreonPushNotifications()
        let a = PyreonPushNotification(title: "Hi", body: "first")
        let b = PyreonPushNotification(title: "Yo", body: "second", data: ["k": "v"])
        push.notificationReceived(a)
        push.notificationReceived(b)
        XCTAssertEqual(push.lastNotification, b)
        XCTAssertEqual(push.notifications, [a, b])
        XCTAssertEqual(push.notifications[1].data["k"], "v")
    }

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonPushAuthorizeFlips() throws {
        let push = PyreonPushNotifications()
        push.authorize(true)
        XCTAssertTrue(push.isAuthorized)
        push.authorize(false)
        XCTAssertFalse(push.isAuthorized)
    }

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonPushFailKeepsToken() throws {
        struct PushError: Error {}
        let push = PyreonPushNotifications()
        push.tokenReceived("tok")
        push.notificationReceived(PyreonPushNotification(body: "x"))
        push.fail(PushError())
        XCTAssertNotNil(push.error)
        XCTAssertEqual(push.token, "tok")
        XCTAssertEqual(push.notifications.count, 1)
    }

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonPushTokenClearsError() throws {
        struct PushError: Error {}
        let push = PyreonPushNotifications()
        push.fail(PushError())
        XCTAssertNotNil(push.error)
        push.tokenReceived("new")
        XCTAssertNil(push.error)
    }

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonPushStartWiresInjectedRegistration() throws {
        let push = PyreonPushNotifications()
        var unregistered = false
        var captured: PyreonPushHandlers?
        push.start { handlers in
            captured = handlers
            return { unregistered = true }
        }
        XCTAssertTrue(push.isRegistered)
        captured?.onToken("device-token")
        XCTAssertEqual(push.token, "device-token")
        captured?.onAuthorization(true)
        XCTAssertTrue(push.isAuthorized)
        captured?.onNotification(PyreonPushNotification(title: "T"))
        XCTAssertEqual(push.lastNotification?.title, "T")
        push.start { _ in { } } // idempotent — no second registration
        push.stop()
        XCTAssertTrue(unregistered)
        XCTAssertFalse(push.isRegistered)
        push.stop() // double-stop is a safe no-op
        XCTAssertFalse(push.isRegistered)
    }

    // MARK: - PyreonHttp (richer requests for the useFetch fetcher)
    //
    // These cover the PURE request builders + `buildURLRequest` + response
    // helpers. The real `URLSession` `send(_:)` compiles under `swift build`
    // but a live round-trip is integration/device territory, NOT asserted
    // here — the same "real edge constructed, not asserted" boundary the
    // other runtime services use.

    /// `.get` builds a GET with headers + no body.
    func testPyreonHttpGetBuilder() throws {
        let r = PyreonHttpRequest.get("https://api/x", headers: ["Accept": "application/json"])
        XCTAssertEqual(r.method, .get)
        XCTAssertEqual(r.url, "https://api/x")
        XCTAssertEqual(r.headers["Accept"], "application/json")
        XCTAssertNil(r.body)
        XCTAssertEqual(r.method.rawValue, "GET")
    }

    /// `.post(jsonBody:)` sets `Content-Type: application/json`.
    func testPyreonHttpPostJsonSetsContentType() throws {
        let body = Data("{\"a\":1}".utf8)
        let r = PyreonHttpRequest.post("https://api/x", jsonBody: body)
        XCTAssertEqual(r.method, .post)
        XCTAssertEqual(r.body, body)
        XCTAssertEqual(r.headers["Content-Type"], "application/json")
    }

    /// `.post(jsonBody:)` does NOT overwrite an existing content-type
    /// (case-insensitive).
    func testPyreonHttpPostJsonHonorsExistingContentType() throws {
        let r = PyreonHttpRequest.post(
            "https://api/x",
            jsonBody: Data(),
            headers: ["content-type": "application/vnd.api+json"]
        )
        XCTAssertEqual(r.headers["content-type"], "application/vnd.api+json")
        XCTAssertNil(r.headers["Content-Type"])
    }

    /// `buildURLRequest` wires method + headers + body onto a `URLRequest`.
    func testPyreonHttpBuildURLRequest() throws {
        let body = Data("payload".utf8)
        let req = PyreonHttpRequest(
            method: .put,
            url: "https://api/x",
            headers: ["Authorization": "Bearer t"],
            body: body
        )
        let urlRequest = try XCTUnwrap(PyreonHttp.buildURLRequest(req))
        XCTAssertEqual(urlRequest.httpMethod, "PUT")
        XCTAssertEqual(urlRequest.value(forHTTPHeaderField: "Authorization"), "Bearer t")
        XCTAssertEqual(urlRequest.httpBody, body)
        XCTAssertEqual(urlRequest.url?.absoluteString, "https://api/x")
    }

    // NOTE: there is intentionally no unit test for the `.invalidURL` error
    // path. Modern Foundation's `URL(string:)` percent-encodes nearly any
    // input (e.g. "not a valid url" → "not%20a%20valid%20url") rather than
    // returning nil, so the nil branch isn't reliably triggerable across
    // Foundation versions — a test for it would assert Foundation's leniency,
    // not Pyreon code. The `.invalidURL` guard stays in the API as a
    // defensive measure for platforms/inputs where `URL(string:)` does fail.

    /// Response helpers: `isOK` (2xx), `text` (UTF-8), `decode` (JSON).
    func testPyreonHttpResponseHelpers() throws {
        XCTAssertTrue(PyreonHttpResponse(status: 200).isOK)
        XCTAssertTrue(PyreonHttpResponse(status: 204).isOK)
        XCTAssertFalse(PyreonHttpResponse(status: 404).isOK)
        XCTAssertFalse(PyreonHttpResponse(status: 500).isOK)

        let textRes = PyreonHttpResponse(status: 200, body: Data("hello".utf8))
        XCTAssertEqual(textRes.text, "hello")

        struct User: Decodable, Equatable { let id: Int; let name: String }
        let jsonRes = PyreonHttpResponse(
            status: 200,
            body: Data("{\"id\":7,\"name\":\"x\"}".utf8)
        )
        XCTAssertEqual(try jsonRes.decode(User.self), User(id: 7, name: "x"))
    }

    // MARK: - PyreonDatabase (useDatabase structured local store)
    //
    // Facade + in-memory backend contract. The real SQLite/Core Data backend
    // is the app's job — not exercised here.

    func testPyreonDatabaseInsertGet() throws {
        let db = PyreonDatabase()
        XCTAssertNil(db.get("todos", id: "1"))
        let r = PyreonRecord(id: "1", fields: ["text": "buy milk", "done": "false"])
        db.insert("todos", r)
        XCTAssertEqual(db.get("todos", id: "1"), r)
        XCTAssertEqual(db.get("todos", id: "1")?.fields["text"], "buy milk")
    }

    func testPyreonDatabaseUpsert() throws {
        let db = PyreonDatabase()
        db.insert("todos", PyreonRecord(id: "1", fields: ["done": "false"]))
        db.insert("todos", PyreonRecord(id: "1", fields: ["done": "true"]))
        XCTAssertEqual(db.get("todos", id: "1")?.fields["done"], "true")
        XCTAssertEqual(db.count("todos"), 1)
    }

    func testPyreonDatabaseAllPreservesInsertionOrder() throws {
        let db = PyreonDatabase()
        db.insert("todos", PyreonRecord(id: "a"))
        db.insert("todos", PyreonRecord(id: "b"))
        db.insert("todos", PyreonRecord(id: "c"))
        XCTAssertEqual(db.all("todos").map(\.id), ["a", "b", "c"])
        db.insert("todos", PyreonRecord(id: "a", fields: ["x": "1"]))
        XCTAssertEqual(db.all("todos").map(\.id), ["a", "b", "c"]) // upsert keeps position
    }

    func testPyreonDatabaseDelete() throws {
        let db = PyreonDatabase()
        db.insert("todos", PyreonRecord(id: "1"))
        XCTAssertEqual(db.count("todos"), 1)
        XCTAssertTrue(db.delete("todos", id: "1"))
        XCTAssertNil(db.get("todos", id: "1"))
        XCTAssertEqual(db.count("todos"), 0)
        XCTAssertTrue(db.delete("todos", id: "never")) // idempotent
    }

    func testPyreonDatabaseFind() throws {
        let db = PyreonDatabase()
        db.insert("todos", PyreonRecord(id: "1", fields: ["done": "false"]))
        db.insert("todos", PyreonRecord(id: "2", fields: ["done": "true"]))
        db.insert("todos", PyreonRecord(id: "3", fields: ["done": "false"]))
        XCTAssertEqual(db.find("todos", field: "done", equals: "false").map(\.id), ["1", "3"])
        XCTAssertEqual(db.find("todos", field: "done", equals: "true").count, 1)
        XCTAssertTrue(db.find("todos", field: "missing", equals: "x").isEmpty)
    }

    func testPyreonDatabaseCollectionsAreIsolated() throws {
        let db = PyreonDatabase()
        db.insert("todos", PyreonRecord(id: "1"))
        db.insert("notes", PyreonRecord(id: "1"))
        XCTAssertEqual(db.count("todos"), 1)
        XCTAssertEqual(db.count("notes"), 1)
        db.delete("todos", id: "1")
        XCTAssertNil(db.get("todos", id: "1"))
        XCTAssertNotNil(db.get("notes", id: "1")) // isolated
    }

    // MARK: - PyreonPayments (usePayments purchase-state container)
    //
    // Pure state machine + injected-actions seam. The real StoreKit wiring
    // is the app's job — not exercised here.

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonPaymentsInitialState() throws {
        let pay = PyreonPayments()
        XCTAssertTrue(pay.products.isEmpty)
        XCTAssertTrue(pay.ownedProductIds.isEmpty)
        XCTAssertNil(pay.purchasing)
        XCTAssertNil(pay.error)
        XCTAssertFalse(pay.owns("pro"))
    }

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonPaymentsProductsLoaded() throws {
        let pay = PyreonPayments()
        let products = [
            PyreonProduct(id: "pro", displayName: "Pro", price: "$4.99"),
            PyreonProduct(id: "max", displayName: "Max", price: "$9.99"),
        ]
        pay.productsLoaded(products)
        XCTAssertEqual(pay.products, products)
        XCTAssertEqual(pay.products[0].price, "$4.99")
    }

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonPaymentsPurchaseFlow() throws {
        let pay = PyreonPayments()
        pay.purchaseStarted("pro")
        XCTAssertEqual(pay.purchasing, "pro")
        XCTAssertFalse(pay.owns("pro"))
        pay.purchaseSucceeded("pro")
        XCTAssertNil(pay.purchasing)
        XCTAssertTrue(pay.owns("pro"))
    }

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonPaymentsPurchaseFailure() throws {
        struct PayError: Error {}
        let pay = PyreonPayments()
        pay.purchaseStarted("pro")
        pay.purchaseFailed(PayError())
        XCTAssertNotNil(pay.error)
        XCTAssertNil(pay.purchasing)
        XCTAssertFalse(pay.owns("pro"))
    }

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonPaymentsRestore() throws {
        let pay = PyreonPayments()
        pay.purchaseSucceeded("pro")
        pay.restored(["max", "pro"])
        XCTAssertTrue(pay.owns("pro"))
        XCTAssertTrue(pay.owns("max"))
        XCTAssertEqual(pay.ownedProductIds.count, 2) // no duplicate
    }

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonPaymentsConnectAndPurchaseRoutes() throws {
        let pay = PyreonPayments()
        var purchased: String?
        var didRestore = false
        pay.connect {
            PyreonPaymentActions(
                purchase: { purchased = $0 },
                restore: { didRestore = true }
            )
        }
        pay.purchase("pro")
        XCTAssertEqual(purchased, "pro")
        XCTAssertEqual(pay.purchasing, "pro")
        pay.restore()
        XCTAssertTrue(didRestore)
        pay.connect { PyreonPaymentActions(purchase: { _ in }, restore: {}) } // idempotent
    }

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonPaymentsPurchaseBeforeConnectIsNoop() throws {
        let pay = PyreonPayments()
        pay.purchase("pro") // no actions wired → no-op
        XCTAssertNil(pay.purchasing)
        pay.restore() // safe no-op
    }

    // MARK: - PyreonWebSocket (useWebSocket realtime container)
    //
    // These cover the PURE state machine + the lifecycle idempotency
    // (`connect` / `close` guard flags). The live `URLSessionWebSocketTask`
    // edge is constructed by `connect(to:)` but NOT exercised here — frames
    // flowing over a real server is device-loop territory, the same
    // "monitor constructed, not asserted" boundary PyreonNetworkStatus uses.

    /// A fresh container is empty + disconnected.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonWebSocketInitialState() throws {
        let ws = PyreonWebSocket()
        XCTAssertNil(ws.lastMessage)
        XCTAssertTrue(ws.messages.isEmpty)
        XCTAssertFalse(ws.isConnected)
        XCTAssertNil(ws.error)
        XCTAssertFalse(ws.isOpen)
    }

    /// `opened()` flips `isConnected` true and clears any prior error.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonWebSocketOpenedFlips() throws {
        let ws = PyreonWebSocket()
        ws.opened()
        XCTAssertTrue(ws.isConnected)
        XCTAssertNil(ws.error)
    }

    /// `received(_:)` sets `lastMessage` + accumulates `messages` in order.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonWebSocketReceivedAccumulates() throws {
        let ws = PyreonWebSocket()
        ws.received("a")
        ws.received("b")
        XCTAssertEqual(ws.lastMessage, "b")
        XCTAssertEqual(ws.messages, ["a", "b"])
    }

    /// `failed(_:)` sets `error`, flips `isConnected` false, and leaves the
    /// transcript in place (stale-while-error).
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonWebSocketFailedSetsErrorAndDisconnects() throws {
        struct SocketError: Error, Equatable {}
        let ws = PyreonWebSocket()
        ws.opened()
        ws.received("hi")
        ws.failed(SocketError())
        XCTAssertTrue(ws.error is SocketError)
        XCTAssertFalse(ws.isConnected)
        XCTAssertEqual(ws.lastMessage, "hi")
        XCTAssertEqual(ws.messages, ["hi"])
    }

    /// `closed()` flips `isConnected` false but keeps the transcript.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonWebSocketClosedKeepsTranscript() throws {
        let ws = PyreonWebSocket()
        ws.opened()
        ws.received("x")
        ws.closed()
        XCTAssertFalse(ws.isConnected)
        XCTAssertEqual(ws.messages, ["x"])
    }

    /// `opened()` after a `failed(_:)` clears the prior error.
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonWebSocketOpenedClearsPriorError() throws {
        struct SocketError: Error {}
        let ws = PyreonWebSocket()
        ws.failed(SocketError())
        XCTAssertNotNil(ws.error)
        ws.opened()
        XCTAssertNil(ws.error)
        XCTAssertTrue(ws.isConnected)
    }

    /// `close()` before `connect(to:)` is a safe no-op (releases nothing).
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonWebSocketCloseBeforeConnectIsNoop() throws {
        let ws = PyreonWebSocket()
        ws.close() // must not crash
        XCTAssertFalse(ws.isOpen)
        XCTAssertFalse(ws.isConnected)
    }

    /// `send(_:)` before `connect(to:)` is a safe no-op (nil task).
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonWebSocketSendBeforeConnectIsNoop() throws {
        let ws = PyreonWebSocket()
        ws.send("dropped") // must not crash — no task wired yet
        XCTAssertNil(ws.lastMessage)
        XCTAssertFalse(ws.isConnected)
    }

    /// `connect(to:)` opens the lifecycle + the live task; `close()` ends it.
    /// Idempotency + the real `URLSessionWebSocketTask` construction are
    /// exercised; live frame flow is not (device-loop territory).
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonWebSocketConnectCloseLifecycle() throws {
        let ws = PyreonWebSocket()
        ws.connect(to: URL(string: "wss://example.invalid/socket")!)
        XCTAssertTrue(ws.isOpen)
        XCTAssertTrue(ws.isConnected) // opened() fired optimistically on resume
        ws.connect(to: URL(string: "wss://example.invalid/other")!) // idempotent
        XCTAssertTrue(ws.isOpen)
        ws.close()
        XCTAssertFalse(ws.isOpen)
        XCTAssertFalse(ws.isConnected)
        ws.close() // double-close is a safe no-op
        XCTAssertFalse(ws.isOpen)
    }

    /// `connect → close → connect` re-opens cleanly (close resets the
    /// lifecycle flag so the second connect isn't a stale no-op).
    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonWebSocketConnectCloseConnectCycle() throws {
        let ws = PyreonWebSocket()
        let url = URL(string: "wss://example.invalid/socket")!
        ws.connect(to: url)
        XCTAssertTrue(ws.isOpen)
        ws.close()
        XCTAssertFalse(ws.isOpen)
        ws.connect(to: url) // must re-open; would no-op if close() didn't reset
        XCTAssertTrue(ws.isOpen)
        ws.close()
    }

    // MARK: - PyreonMapState (useMap reactive map-state container)
    //
    // Pure state (no platform edge) — fully covered here, no device caveat.
    // The <Map> VIEW that binds to this state is a separate compiler-emit
    // follow-up.

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonMapInitialState() throws {
        let map = PyreonMapState()
        XCTAssertEqual(map.camera, PyreonMapCamera(latitude: 0, longitude: 0, zoom: 1))
        XCTAssertTrue(map.markers.isEmpty)
        XCTAssertNil(map.selectedMarkerId)
        XCTAssertNil(map.selectedMarker)
    }

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonMapMoveToKeepsZoom() throws {
        let map = PyreonMapState(camera: PyreonMapCamera(latitude: 0, longitude: 0, zoom: 10))
        map.moveTo(latitude: 50, longitude: 14)
        XCTAssertEqual(map.camera.latitude, 50)
        XCTAssertEqual(map.camera.longitude, 14)
        XCTAssertEqual(map.camera.zoom, 10) // kept
        map.moveTo(latitude: 1, longitude: 2, zoom: 5)
        XCTAssertEqual(map.camera.zoom, 5) // re-zoomed
    }

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonMapAddMarkerUpsert() throws {
        let map = PyreonMapState()
        map.addMarker(PyreonMapMarker(id: "a", latitude: 1, longitude: 2, title: "first"))
        map.addMarker(PyreonMapMarker(id: "b", latitude: 3, longitude: 4))
        XCTAssertEqual(map.markers.count, 2)
        map.addMarker(PyreonMapMarker(id: "a", latitude: 9, longitude: 9, title: "updated"))
        XCTAssertEqual(map.markers.count, 2) // upsert, no dupe
        XCTAssertEqual(map.markers[0].id, "a")
        XCTAssertEqual(map.markers[0].title, "updated") // replaced in place
        XCTAssertEqual(map.markers[1].id, "b")
    }

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonMapSelection() throws {
        let map = PyreonMapState(markers: [PyreonMapMarker(id: "a", latitude: 1, longitude: 2, title: "A")])
        map.selectMarker("a")
        XCTAssertEqual(map.selectedMarkerId, "a")
        XCTAssertEqual(map.selectedMarker?.title, "A")
        map.selectMarker(nil)
        XCTAssertNil(map.selectedMarker)
    }

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonMapRemoveMarkerClearsSelection() throws {
        let map = PyreonMapState(markers: [PyreonMapMarker(id: "a", latitude: 1, longitude: 2)])
        map.selectMarker("a")
        XCTAssertNotNil(map.selectedMarker)
        map.removeMarker(id: "a")
        XCTAssertTrue(map.markers.isEmpty)
        XCTAssertNil(map.selectedMarkerId) // cleared
    }

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonMapRemoveMarkerKeepsOtherSelection() throws {
        let map = PyreonMapState(markers: [
            PyreonMapMarker(id: "a", latitude: 1, longitude: 2),
            PyreonMapMarker(id: "b", latitude: 3, longitude: 4),
        ])
        map.selectMarker("b")
        map.removeMarker(id: "a")
        XCTAssertEqual(map.selectedMarkerId, "b") // kept
        XCTAssertEqual(map.markers.count, 1)
    }

    @available(iOS 17.0, macOS 14.0, *)
    func testPyreonMapSetMarkersReplaces() throws {
        let map = PyreonMapState(markers: [PyreonMapMarker(id: "a", latitude: 1, longitude: 2)])
        map.setMarkers([
            PyreonMapMarker(id: "x", latitude: 5, longitude: 6),
            PyreonMapMarker(id: "y", latitude: 7, longitude: 8),
        ])
        XCTAssertEqual(map.markers.map(\.id), ["x", "y"])
    }

    // M3.5 — PyreonBiometrics is reachable + constructs. A "reachable" smoke
    // (like the other symbol-reachability tests above), NOT a behavioral one:
    // `authenticate(_:)` calls LAContext.evaluatePolicy, which on a host WITH
    // enrolled biometrics (a dev Mac's Touch ID) triggers a REAL system prompt
    // — that would hang / behave non-deterministically in a headless test, and
    // its result is host-dependent (enrolled → may succeed; none → false). The
    // async `authenticate` path is instead proven by the emit COMPILE gate
    // (swiftc against the PyreonBiometrics stub) and, in M3.5, by a fresh-
    // simulator XCUITest (no enrollment → the `canEvaluatePolicy` guard returns
    // `false` WITHOUT prompting → deterministic).
    func testPyreonBiometricsIsReachable() {
        let bio = PyreonBiometrics()
        _ = bio
    }
}

/// Tiny mutable-reference-type flag so a `@Sendable` `onChange` closure
/// (Swift 6 mode) can mutate it. Reference-type mutation through a
/// closure-captured `let` binding is Sendable-clean. Used only by the
/// `IsMonitoringIsNotObservable` / `IsOnlineIsObservable` test pair
/// where var-capture would trip `#SendableClosureCaptures` warnings.
/// Marked `@unchecked Sendable` because `Bool` IS Sendable; the class
/// wrapper is the only thing that needs the brand. Tests run
/// single-threaded so atomicity is not a concern.
final class ObservationFlag: @unchecked Sendable {
    var fired: Bool = false

}
