// Smoke tests for the PyreonRouter Swift package scaffold.
//
// These exercise the imperative router surface (push / replace / back /
// reset / params) — pure-model tests, no SwiftUI rendering required.
// Per the @pyreon/native-runtime-swift convention, View-level rendering
// tests defer to per-feature PRs that introduce real route handling.

import XCTest
@testable import PyreonRouter

@available(iOS 17.0, macOS 14.0, *)
final class PyreonRouterTests: XCTestCase {
    /// Fresh router starts with an empty path stack — NavigationStack's
    /// root view is whatever the host passes as its content.
    func testInitialStackIsEmpty() throws {
        let router = PyreonRouter()
        XCTAssertEqual(router.path, [])
        XCTAssertEqual(router.currentPath, "/")
    }

    /// `push(_:)` appends to the stack and updates `currentPath`.
    func testPushAppendsToStack() throws {
        let router = PyreonRouter()
        router.push("/users")
        XCTAssertEqual(router.path, ["/users"])
        XCTAssertEqual(router.currentPath, "/users")

        router.push("/users/123")
        XCTAssertEqual(router.path, ["/users", "/users/123"])
        XCTAssertEqual(router.currentPath, "/users/123")
    }

    /// `replace(_:)` overwrites the top-of-stack. Used for redirects
    /// where the source page shouldn't be in the back history (login
    /// → dashboard transitions).
    func testReplaceOverwritesTopOfStack() throws {
        let router = PyreonRouter(initialPath: ["/login"])
        router.replace("/dashboard")
        XCTAssertEqual(router.path, ["/dashboard"])
        XCTAssertEqual(router.currentPath, "/dashboard")
    }

    /// `replace(_:)` on an empty stack acts like `push(_:)` — the
    /// host's root view is replaced by the new top-of-stack. Matches
    /// the web side's behaviour.
    func testReplaceOnEmptyStackPushes() throws {
        let router = PyreonRouter()
        router.replace("/home")
        XCTAssertEqual(router.path, ["/home"])
    }

    /// `back()` pops the top-of-stack. NavigationStack handles the
    /// animation; the model just shrinks.
    func testBackPopsTopOfStack() throws {
        let router = PyreonRouter(initialPath: ["/home", "/users", "/users/123"])
        router.back()
        XCTAssertEqual(router.path, ["/home", "/users"])
        XCTAssertEqual(router.currentPath, "/users")
    }

    /// `back()` on an empty stack is a no-op — there's nothing to
    /// pop back to (NavigationStack root view).
    func testBackOnEmptyStackIsNoOp() throws {
        let router = PyreonRouter()
        router.back()
        XCTAssertEqual(router.path, [])
    }

    /// `reset()` clears the entire stack — navigates back to the root
    /// view. Used for "logout / forget everything" flows.
    func testResetClearsStack() throws {
        let router = PyreonRouter(initialPath: ["/a", "/b", "/c"])
        router.reset()
        XCTAssertEqual(router.path, [])
        XCTAssertEqual(router.currentPath, "/")
    }

    /// Initial-path constructor accepts a pre-populated stack — useful
    /// for deep-link restoration where the app boots into a non-root path.
    func testInitialPathPopulatesStack() throws {
        let router = PyreonRouter(initialPath: ["/users/123/posts"])
        XCTAssertEqual(router.path, ["/users/123/posts"])
        XCTAssertEqual(router.currentPath, "/users/123/posts")
    }

    /// `params` is mutable so the route-matching layer (Phase C2+)
    /// can write to it as routes change. Phase C1 just verifies the
    /// dictionary is reachable + readable.
    func testParamsIsReadableAndWritable() throws {
        let router = PyreonRouter()
        XCTAssertEqual(router.params, [:])

        router.params["id"] = "123"
        XCTAssertEqual(router.params["id"], "123")
    }

    /// `useNavigate(router:)` returns a closure that wraps `push(_:)`.
    /// Equivalent to the web side's `const navigate = useNavigate()`.
    func testUseNavigateClosure() throws {
        let router = PyreonRouter()
        let navigate = useNavigate(router: router)
        navigate("/profile")
        XCTAssertEqual(router.currentPath, "/profile")
    }

    /// `useNavigate(router: nil)` returns a no-op closure (no router
    /// in scope). Matches the web side's safe-no-op behaviour when a
    /// `useNavigate()` call escapes its provider tree.
    func testUseNavigateWithoutRouterIsNoOp() throws {
        let navigate = useNavigate(router: nil)
        navigate("/anywhere") // Should not crash.
    }

    /// `useParams(router:)` reads the active router's `params` dict.
    /// Returns the live dictionary, not a snapshot — so updates to
    /// `router.params` are visible.
    func testUseParamsReadsRouter() throws {
        let router = PyreonRouter()
        router.params = ["id": "42", "filter": "active"]
        let params = useParams(router: router)
        XCTAssertEqual(params["id"], "42")
        XCTAssertEqual(params["filter"], "active")
    }

    /// `useParams(router: nil)` returns empty dict — defensive default
    /// for missing-provider case.
    func testUseParamsWithoutRouterIsEmpty() throws {
        let params = useParams(router: nil)
        XCTAssertEqual(params, [:])
    }

    // MARK: - matchPath (route pattern matching)

    /// A literal pattern matches only its exact path; params are empty.
    func testMatchPathLiteral() throws {
        XCTAssertEqual(PyreonRouter.matchPath("/about", "/about"), [:])
        XCTAssertNil(PyreonRouter.matchPath("/about", "/contact"))
    }

    /// `:name` captures a single segment.
    func testMatchPathSingleParam() throws {
        XCTAssertEqual(PyreonRouter.matchPath("/users/123", "/users/:id"), ["id": "123"])
        XCTAssertEqual(
            PyreonRouter.matchPath("/posts/abc/edit", "/posts/:slug/edit"),
            ["slug": "abc"]
        )
    }

    /// Wrong literal segment or wrong length → no match.
    func testMatchPathMismatch() throws {
        XCTAssertNil(PyreonRouter.matchPath("/users/123", "/posts/:id"))
        // Longer path must not match a shorter non-splat pattern.
        XCTAssertNil(PyreonRouter.matchPath("/users/123/extra", "/users/:id"))
        // Shorter path must not match a longer pattern.
        XCTAssertNil(PyreonRouter.matchPath("/users", "/users/:id"))
    }

    /// `:name*` (splat) captures the remaining tail joined by "/".
    func testMatchPathSplatCapturesTail() throws {
        XCTAssertEqual(
            PyreonRouter.matchPath("/blog/2026/may/post", "/blog/:rest*"),
            ["rest": "2026/may/post"]
        )
        // Single trailing segment still matches the splat.
        XCTAssertEqual(PyreonRouter.matchPath("/files/readme", "/files/:path*"), ["path": "readme"])
    }

    /// Splat is one-or-more: the splat position must have a segment.
    func testMatchPathSplatRequiresOneSegment() throws {
        XCTAssertNil(PyreonRouter.matchPath("/blog", "/blog/:rest*"))
    }

    /// Splat composes with leading literal + param segments.
    func testMatchPathSplatAfterParam() throws {
        XCTAssertEqual(
            PyreonRouter.matchPath("/u/42/files/a/b", "/u/:id/files/:rest*"),
            ["id": "42", "rest": "a/b"]
        )
    }

    /// `:name?` (trailing optional) may be present or omitted by the path.
    func testMatchPathOptionalSegment() throws {
        // Present → captured.
        XCTAssertEqual(PyreonRouter.matchPath("/users/7", "/users/:id?"), ["id": "7"])
        // Omitted → matches with the optional param absent.
        XCTAssertEqual(PyreonRouter.matchPath("/users", "/users/:id?"), [:])
        // A REQUIRED segment after the optional must still be present.
        XCTAssertNil(PyreonRouter.matchPath("/users", "/users/:id?/edit"))
        // Path longer than the full pattern never matches.
        XCTAssertNil(PyreonRouter.matchPath("/users/7/extra", "/users/:id?"))
    }

    /// Leading / trailing slashes are tolerated (empty segments filtered).
    func testMatchPathSlashTolerance() throws {
        XCTAssertEqual(PyreonRouter.matchPath("/about/", "/about"), [:])
        XCTAssertEqual(PyreonRouter.matchPath("/about", "/about/"), [:])
        XCTAssertEqual(PyreonRouter.matchPath("/users/7/", "/users/:id"), ["id": "7"])
        // Root matches root.
        XCTAssertEqual(PyreonRouter.matchPath("/", "/"), [:])
    }

    // MARK: - loaderData / useLoaderData (Phase 3 loaders runtime contract)

    private struct LoadedUser: Equatable {
        let name: String
    }

    /// `setLoaderData` stores by path; `useLoaderData` reads the current
    /// route's entry, typed via the generic cast.
    func testUseLoaderDataReadsCurrentRoute() throws {
        let router = PyreonRouter(initialPath: ["/users/7"])
        router.setLoaderData("/users/7", LoadedUser(name: "Ada"))
        let user: LoadedUser? = useLoaderData(router: router)
        XCTAssertEqual(user, LoadedUser(name: "Ada"))
    }

    /// No data for the current path → nil (defensive default).
    func testUseLoaderDataMissingReturnsNil() throws {
        let router = PyreonRouter(initialPath: ["/users/7"])
        let user: LoadedUser? = useLoaderData(router: router)
        XCTAssertNil(user)
    }

    /// A type mismatch casts to nil rather than crashing.
    func testUseLoaderDataTypeMismatchReturnsNil() throws {
        let router = PyreonRouter(initialPath: ["/x"])
        router.setLoaderData("/x", "a string, not a LoadedUser")
        let user: LoadedUser? = useLoaderData(router: router)
        XCTAssertNil(user)
    }

    /// A nil router → nil (no provider / hand-rolled call site).
    func testUseLoaderDataNilRouterReturnsNil() throws {
        let user: LoadedUser? = useLoaderData(router: nil)
        XCTAssertNil(user)
    }

    // MARK: - loaderData LRU bound (Round-1 audit fix — Class C unbounded cache)

    /// Normal usage under the cap leaves all entries in place — the LRU
    /// bound only fires when adding a NEW key would push the count past
    /// the limit. Confirms the happy path isn't broken.
    func testLoaderDataUnderCapKeepsAllEntries() throws {
        let router = PyreonRouter()
        for i in 0..<10 {
            router.setLoaderData("/path/\(i)", "value-\(i)")
        }
        XCTAssertEqual(router.loaderData.count, 10)
        // All 10 keys still present.
        for i in 0..<10 {
            XCTAssertNotNil(router.loaderData["/path/\(i)"])
        }
    }

    /// Past the cap, adding a NEW key evicts the OLDEST insertion. The
    /// count stays pinned at the cap; the new key is present; the very
    /// first key inserted is gone.
    func testLoaderDataAtCapEvictsOldestOnNewKey() throws {
        let router = PyreonRouter()
        // Fill to cap + 1 — one eviction triggered.
        for i in 0...PyreonRouter.MAX_LOADER_ENTRIES {
            router.setLoaderData("/path/\(i)", "value-\(i)")
        }
        XCTAssertEqual(router.loaderData.count, PyreonRouter.MAX_LOADER_ENTRIES)
        // The first key inserted (/path/0) was evicted; the last
        // (/path/<MAX>) is present.
        XCTAssertNil(router.loaderData["/path/0"])
        XCTAssertNotNil(router.loaderData["/path/\(PyreonRouter.MAX_LOADER_ENTRIES)"])
    }

    /// Repeated heavy use across hundreds of distinct paths stays pinned
    /// at the cap — the bug class this fix exists to close. Pre-fix the
    /// count would equal 500 (unbounded growth).
    func testLoaderDataStaysBoundedUnderHeavyNavigation() throws {
        let router = PyreonRouter()
        for i in 0..<500 {
            router.setLoaderData("/p/\(i)", i)
        }
        XCTAssertEqual(router.loaderData.count, PyreonRouter.MAX_LOADER_ENTRIES)
    }

    /// Re-storing the SAME path (a re-navigation to a previously-visited
    /// route after its loader re-ran) is an in-place value swap — it
    /// does NOT count as a new insertion, so it never evicts. The
    /// count stays at exactly 1 across many overwrites.
    func testLoaderDataOverwriteDoesNotEvict() throws {
        let router = PyreonRouter()
        for v in 0..<100 {
            router.setLoaderData("/same-path", v)
        }
        XCTAssertEqual(router.loaderData.count, 1)
        XCTAssertEqual(router.loaderData["/same-path"] as? Int, 99)
    }

    // MARK: - Global beforeEach / afterEach guards (Round-2 follow-up)

    /// Empty guard chain → push behaves as before (path appends; no
    /// observable side effects from guards).
    func testGuardsEmptyChainDoesNotInterfere() throws {
        let router = PyreonRouter()
        router.push("/a")
        XCTAssertEqual(router.path, ["/a"])
    }

    /// Single beforeEach guard returning true → navigation proceeds.
    func testBeforeEachAllowsWhenTrue() throws {
        let router = PyreonRouter()
        router.beforeEachGuards.append { _ in true }
        router.push("/allowed")
        XCTAssertEqual(router.path, ["/allowed"])
    }

    /// Single beforeEach guard returning false → push is BLOCKED;
    /// path stays untouched.
    func testBeforeEachBlocksWhenFalse() throws {
        let router = PyreonRouter()
        router.beforeEachGuards.append { _ in false }
        router.push("/blocked")
        XCTAssertEqual(router.path, [])
        XCTAssertEqual(router.currentPath, "/")
    }

    /// Replace is also gated by beforeEach.
    func testBeforeEachBlocksReplace() throws {
        let router = PyreonRouter(initialPath: ["/start"])
        router.beforeEachGuards.append { _ in false }
        router.replace("/blocked")
        XCTAssertEqual(router.path, ["/start"])
    }

    /// Multiple beforeEach: AND chain. Any one false → blocked.
    func testBeforeEachChainsAndBlocksOnAnyFalse() throws {
        let router = PyreonRouter()
        router.beforeEachGuards.append { _ in true }
        router.beforeEachGuards.append { _ in false }
        router.beforeEachGuards.append { _ in true }
        router.push("/blocked")
        XCTAssertEqual(router.path, [])
    }

    /// beforeEach receives the candidate path so guards can decide
    /// per-route — `path-based` auth gating is the canonical use.
    func testBeforeEachReceivesCandidatePath() throws {
        let router = PyreonRouter()
        var seen: [String] = []
        router.beforeEachGuards.append { p in seen.append(p); return true }
        router.push("/users")
        router.push("/users/42")
        XCTAssertEqual(seen, ["/users", "/users/42"])
    }

    /// afterEach runs AFTER the path commits — guards can read
    /// `router.currentPath` and see the new value.
    func testAfterEachRunsAfterPathCommit() throws {
        let router = PyreonRouter()
        var observed: [String] = []
        router.afterEachHooks.append { committed in observed.append(committed) }
        router.push("/a")
        router.push("/b")
        XCTAssertEqual(observed, ["/a", "/b"])
        XCTAssertEqual(router.currentPath, "/b")
    }

    /// afterEach is NOT called when beforeEach blocks (push aborted
    /// before commit).
    func testAfterEachSkippedWhenBlocked() throws {
        let router = PyreonRouter()
        router.beforeEachGuards.append { _ in false }
        var afterCount = 0
        router.afterEachHooks.append { _ in afterCount += 1 }
        router.push("/blocked")
        XCTAssertEqual(afterCount, 0)
    }

    // MARK: - Throw-redirect pattern

    /// `router.redirect("/login")` from outside a guard behaves
    /// identically to `replace("/login")`.
    func testRedirectOutsideGuardActsLikeReplace() throws {
        let router = PyreonRouter(initialPath: ["/home"])
        router.redirect("/login")
        XCTAssertEqual(router.path, ["/login"])
    }

    /// Canonical "throw redirect" pattern: beforeEach detects auth-
    /// deny, calls `router.redirect("/login")`, returns false to
    /// block the original navigation. End state: path becomes /login.
    func testRedirectFromGuardSetsTargetAndBlocksOriginal() throws {
        var router: PyreonRouter!
        router = PyreonRouter()
        router.beforeEachGuards.append { path in
            if path != "/login" {
                router.redirect("/login")
                return false
            }
            return true
        }
        router.push("/profile")
        XCTAssertEqual(router.currentPath, "/login")
    }

    /// Re-entry protection: the redirect target is NOT itself blocked
    /// by the SAME guard (no infinite recursion).
    func testRedirectTargetItselfIsAllowedByGuard() throws {
        var router: PyreonRouter!
        router = PyreonRouter()
        var guardCalls = 0
        router.beforeEachGuards.append { path in
            guardCalls += 1
            if path == "/admin" {
                router.redirect("/login")
                return false
            }
            return true
        }
        router.push("/admin")
        // Guard fires ONCE — the nested redirect skips re-checking.
        XCTAssertEqual(guardCalls, 1)
        XCTAssertEqual(router.currentPath, "/login")
    }

    /// `redirect` from a guard skips the OUTER afterEach (outer push
    /// blocked) AND the inner replace's afterEach (re-entry skip).
    /// Net: zero afterEach fires for the redirect case.
    func testRedirectFromGuardSkipsAfterEach() throws {
        var router: PyreonRouter!
        router = PyreonRouter()
        var afterCalls: [String] = []
        router.afterEachHooks.append { p in afterCalls.append(p) }
        router.beforeEachGuards.append { path in
            if path == "/admin" {
                router.redirect("/login")
                return false
            }
            return true
        }
        router.push("/admin")
        XCTAssertEqual(afterCalls, [])
    }
}
