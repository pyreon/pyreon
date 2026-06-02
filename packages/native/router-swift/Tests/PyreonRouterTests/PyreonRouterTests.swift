// Smoke tests for the PyreonRouter Swift package scaffold.
//
// These exercise the imperative router surface (push / replace / back /
// reset / params) — pure-model tests, no SwiftUI rendering required.
// Per the @pyreon/native-runtime-swift convention, View-level rendering
// tests defer to per-feature PRs that introduce real route handling.

import SwiftUI  // A4: tests construct RouteRecord with `{ AnyView(EmptyView()) }` components
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

    // MARK: - Phase A4 — Route table dispatcher
    //
    // 2026-06 native readiness audit, closes CRIT-2 partial + CRIT-3
    // partial. Backwards-compat: apps that don't configure `routes`
    // keep pre-A4 behavior (params stays empty, RouterView is no-op).
    // Apps that DO configure `routes` get matchPath-driven dispatch
    // and useParams populates per navigation.

    /// Fresh router with NO routes configured keeps pre-A4 behavior:
    /// params stays empty regardless of push/replace.
    func testBackwardsCompatNoRoutesParamsStaysEmpty() throws {
        let router = PyreonRouter()
        router.push("/users/42")
        XCTAssertEqual(router.params, [:])
        router.replace("/users/99")
        XCTAssertEqual(router.params, [:])
    }

    /// `push` against a route table populates params from the
    /// matchPath result — the core CRIT-3 fix.
    func testPushPopulatesParamsFromMatchedRoute() throws {
        let router = PyreonRouter(routes: [
            RouteRecord(path: "/users/:id") { AnyView(EmptyView()) },
            RouteRecord(path: "/posts/:slug/edit") { AnyView(EmptyView()) },
        ])
        router.push("/users/42")
        XCTAssertEqual(router.params, ["id": "42"])
        router.push("/posts/hello-world/edit")
        XCTAssertEqual(router.params, ["slug": "hello-world"])
    }

    /// `replace` against a route table also populates params.
    func testReplacePopulatesParamsFromMatchedRoute() throws {
        let router = PyreonRouter(routes: [
            RouteRecord(path: "/users/:id") { AnyView(EmptyView()) },
        ])
        router.replace("/users/abc")
        XCTAssertEqual(router.params, ["id": "abc"])
    }

    /// Navigating to a path with NO matching route clears params —
    /// stale params from the previous match must not leak.
    func testNoMatchClearsParams() throws {
        let router = PyreonRouter(routes: [
            RouteRecord(path: "/users/:id") { AnyView(EmptyView()) },
        ])
        router.push("/users/42")
        XCTAssertEqual(router.params, ["id": "42"])
        router.push("/about")  // no match in routes
        XCTAssertEqual(router.params, [:])
    }

    /// `back()` recomputes params from the newly-exposed top-of-stack
    /// path. Pop reveals the previous route's params (not stale ones
    /// from the popped route).
    func testBackRecomputesParamsFromPreviousRoute() throws {
        let router = PyreonRouter(routes: [
            RouteRecord(path: "/users/:id") { AnyView(EmptyView()) },
            RouteRecord(path: "/posts/:slug") { AnyView(EmptyView()) },
        ])
        router.push("/users/1")
        router.push("/posts/hello")
        XCTAssertEqual(router.params, ["slug": "hello"])
        router.back()
        // After pop, top-of-stack is "/users/1" → params should
        // reflect THAT route, not the popped "/posts/hello".
        XCTAssertEqual(router.params, ["id": "1"])
    }

    /// `resolveCurrentRoute()` returns the matched (record, params)
    /// tuple for the current path. RouterView depends on this for
    /// rendering.
    func testResolveCurrentRouteReturnsMatchedRecord() throws {
        let router = PyreonRouter(routes: [
            RouteRecord(path: "/") { AnyView(EmptyView()) },
            RouteRecord(path: "/users/:id") { AnyView(EmptyView()) },
        ])
        router.push("/users/7")
        let resolved = router.resolveCurrentRoute()
        XCTAssertNotNil(resolved)
        XCTAssertEqual(resolved?.route.path, "/users/:id")
        XCTAssertEqual(resolved?.params, ["id": "7"])
    }

    /// `resolveCurrentRoute()` returns nil when no route matches.
    /// RouterView falls through to EmptyView in this case.
    func testResolveCurrentRouteReturnsNilOnNoMatch() throws {
        let router = PyreonRouter(routes: [
            RouteRecord(path: "/users/:id") { AnyView(EmptyView()) },
        ])
        router.push("/about")
        XCTAssertNil(router.resolveCurrentRoute())
    }

    /// Declaration order IS precedence — the FIRST matching record
    /// wins, even when a later record would also match.
    func testDeclarationOrderIsPrecedence() throws {
        let router = PyreonRouter(routes: [
            RouteRecord(path: "/:type/:id") { AnyView(EmptyView()) },  // matches everything first
            RouteRecord(path: "/users/:id") { AnyView(EmptyView()) },  // more specific, but declared 2nd
        ])
        router.push("/users/42")
        let resolved = router.resolveCurrentRoute()
        XCTAssertEqual(resolved?.route.path, "/:type/:id")
        // The user-controllable contract: declaration order is the
        // app's lever to express precedence. More specific routes
        // first; catch-alls last.
        XCTAssertEqual(resolved?.params, ["type": "users", "id": "42"])
    }

    /// Initializer-time path resolution: an app constructing a router
    /// with `initialPath: ["/users/42"]` should have `params["id"]`
    /// available immediately — no need to call push just to populate.
    func testInitialPathPopulatesParams() throws {
        let router = PyreonRouter(
            initialPath: ["/users/42"],
            routes: [RouteRecord(path: "/users/:id") { AnyView(EmptyView()) }],
        )
        XCTAssertEqual(router.params, ["id": "42"])
    }

    // MARK: - Phase B8 — forward() + canGoForward + history semantics
    //
    // 2026-06 native readiness audit. Closes scout-5's "no forward()"
    // finding. SwiftUI's NavigationStack doesn't natively support
    // browser-style forward, so we implement a forward-history stack
    // that captures paths popped via back() and re-pushes on forward().

    /// `canGoForward` is false by default and stays false until back()
    /// pops at least one entry.
    func testCanGoForwardStartsFalse() throws {
        let router = PyreonRouter(initialPath: ["/home"])
        XCTAssertFalse(router.canGoForward)
        router.push("/about")
        XCTAssertFalse(router.canGoForward)
    }

    /// `back()` makes the popped path available via `forward()`.
    func testBackEnablesForward() throws {
        let router = PyreonRouter(initialPath: ["/home"])
        router.push("/about")
        XCTAssertEqual(router.currentPath, "/about")
        router.back()
        XCTAssertEqual(router.currentPath, "/home")
        XCTAssertTrue(router.canGoForward)
        router.forward()
        XCTAssertEqual(router.currentPath, "/about")
        XCTAssertFalse(router.canGoForward)  // forward stack consumed
    }

    /// `forward()` is a no-op when forward stack is empty (no
    /// back() called yet, or stack already drained).
    func testForwardIsNoOpWhenEmpty() throws {
        let router = PyreonRouter(initialPath: ["/home"])
        router.forward()  // no-op
        XCTAssertEqual(router.currentPath, "/home")
    }

    /// `push()` clears forward history (browser convention — once you
    /// navigate somewhere new, the old redo branch is gone).
    func testPushClearsForwardHistory() throws {
        let router = PyreonRouter(initialPath: ["/home"])
        router.push("/a")
        router.push("/b")
        router.back()  // back to /a, forward stack = [/b]
        XCTAssertTrue(router.canGoForward)
        router.push("/c")  // NEW navigation — clears forward
        XCTAssertFalse(router.canGoForward)
    }

    /// `replace()` ALSO clears forward history (same convention).
    func testReplaceClearsForwardHistory() throws {
        let router = PyreonRouter(initialPath: ["/home"])
        router.push("/a")
        router.back()
        XCTAssertTrue(router.canGoForward)
        router.replace("/b")  // NEW navigation
        XCTAssertFalse(router.canGoForward)
    }

    /// `reset()` clears BOTH path AND forward stacks — "blow-away"
    /// shape (logout, forget everything).
    func testResetClearsForwardHistory() throws {
        let router = PyreonRouter(initialPath: ["/a", "/b", "/c"])
        router.back()  // forward stack = [/c]
        XCTAssertTrue(router.canGoForward)
        router.reset()
        XCTAssertFalse(router.canGoForward)
        XCTAssertEqual(router.path, [])
    }

    /// Multiple back()s accumulate forward stack; multiple forward()s
    /// drain it in reverse order.
    func testBackBackForwardForwardRestoresOrder() throws {
        let router = PyreonRouter(initialPath: ["/home"])
        router.push("/a")
        router.push("/b")
        router.push("/c")
        XCTAssertEqual(router.path, ["/home", "/a", "/b", "/c"])
        router.back()  // → ["/home", "/a", "/b"], forward = [/c]
        router.back()  // → ["/home", "/a"], forward = [/c, /b]
        XCTAssertEqual(router.currentPath, "/a")
        router.forward()  // → ["/home", "/a", "/b"], forward = [/c]
        XCTAssertEqual(router.currentPath, "/b")
        router.forward()  // → ["/home", "/a", "/b", "/c"], forward = []
        XCTAssertEqual(router.currentPath, "/c")
        XCTAssertFalse(router.canGoForward)
    }
}
