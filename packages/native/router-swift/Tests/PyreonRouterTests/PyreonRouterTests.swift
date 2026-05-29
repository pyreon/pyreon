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
}
