// Smoke tests for the PyreonRouter Kotlin package scaffold.
//
// These exercise the imperative router surface (push / replace /
// back / reset / params) — pure-model tests, no Compose runtime
// required. Per the @pyreon/native-runtime-kotlin convention,
// Composable-level tests defer to per-feature PRs that introduce
// real route handling.
//
// Runs via `java -jar` on the JAR `verify-kotlin.ts` produces
// (`-include-runtime` mode). The `expect` / `expectEq` helpers
// match `@pyreon/native-runtime-kotlin`'s assertion style — keeps
// the smoke harness dependency-free (no JUnit, no kotlinx-test).

package com.pyreon.router

private fun expect(condition: Boolean, message: String) {
    if (!condition) error("EXPECT FAILED: $message")
}

private fun <T> expectEq(actual: T, expected: T, message: String) {
    if (actual != expected) error("EXPECT FAILED: $message (expected=$expected, actual=$actual)")
}

private fun runTest(name: String, block: () -> Unit) {
    try {
        block()
        println("✓ $name")
    } catch (e: Throwable) {
        println("✗ $name: ${e.message}")
        throw e
    }
}

fun main() {
    runTest("fresh router starts with empty stack") {
        val router = PyreonRouter()
        expectEq(router.path.value, emptyList(), "path stack")
        expectEq(router.currentPath, "/", "currentPath sentinel")
    }

    runTest("push appends to stack") {
        val router = PyreonRouter()
        router.push("/users")
        expectEq(router.path.value, listOf("/users"), "after first push")
        expectEq(router.currentPath, "/users", "currentPath after push")

        router.push("/users/123")
        expectEq(router.path.value, listOf("/users", "/users/123"), "after second push")
        expectEq(router.currentPath, "/users/123", "currentPath after nested push")
    }

    runTest("replace overwrites top of stack") {
        val router = PyreonRouter(initialPath = listOf("/login"))
        router.replace("/dashboard")
        expectEq(router.path.value, listOf("/dashboard"), "after replace")
        expectEq(router.currentPath, "/dashboard", "currentPath after replace")
    }

    runTest("replace on empty stack pushes") {
        val router = PyreonRouter()
        router.replace("/home")
        expectEq(router.path.value, listOf("/home"), "replace on empty stack")
    }

    runTest("back pops top of stack") {
        val router = PyreonRouter(initialPath = listOf("/home", "/users", "/users/123"))
        router.back()
        expectEq(router.path.value, listOf("/home", "/users"), "after back")
        expectEq(router.currentPath, "/users", "currentPath after back")
    }

    runTest("back on empty stack is no-op") {
        val router = PyreonRouter()
        router.back()
        expectEq(router.path.value, emptyList(), "back on empty is no-op")
    }

    runTest("reset clears stack") {
        val router = PyreonRouter(initialPath = listOf("/a", "/b", "/c"))
        router.reset()
        expectEq(router.path.value, emptyList(), "after reset")
        expectEq(router.currentPath, "/", "currentPath after reset")
    }

    runTest("initial path populates stack") {
        val router = PyreonRouter(initialPath = listOf("/users/123/posts"))
        expectEq(router.path.value, listOf("/users/123/posts"), "initial path stack")
        expectEq(router.currentPath, "/users/123/posts", "currentPath from initial")
    }

    runTest("params is reactive and writable") {
        val router = PyreonRouter()
        expectEq(router.params.value, emptyMap(), "params starts empty")

        router.params.value = mapOf("id" to "123")
        expectEq(router.params.value["id"], "123", "params reads back")
    }

    runTest("loaderData stores per-path and reads back") {
        val router = PyreonRouter(initialPath = listOf("/users/7"))
        expectEq(router.loaderData.value, emptyMap(), "loaderData starts empty")

        router.setLoaderData("/users/7", "Ada")
        expectEq(router.loaderData.value[router.currentPath], "Ada", "reads current-path entry")
        // A typed cast at the read site mirrors useLoaderData<T>()'s `as? T`.
        expectEq(router.loaderData.value[router.currentPath] as? String, "Ada", "typed cast round-trips")
        expectEq(router.loaderData.value["/other"] as? String, null, "missing path → null")
    }

    // matchPath — route pattern matching (mirrors Swift runtime + web).

    runTest("matchPath literal match / mismatch") {
        expectEq(PyreonRouter.matchPath("/about", "/about"), emptyMap(), "literal match")
        expectEq(PyreonRouter.matchPath("/about", "/contact"), null, "literal mismatch")
    }

    runTest("matchPath captures single :param") {
        expectEq(PyreonRouter.matchPath("/users/123", "/users/:id"), mapOf("id" to "123"), "id param")
        expectEq(
            PyreonRouter.matchPath("/posts/abc/edit", "/posts/:slug/edit"),
            mapOf("slug" to "abc"),
            "slug param",
        )
    }

    runTest("matchPath rejects wrong literal / length") {
        expectEq(PyreonRouter.matchPath("/users/123", "/posts/:id"), null, "wrong literal")
        expectEq(PyreonRouter.matchPath("/users/123/extra", "/users/:id"), null, "too long")
        expectEq(PyreonRouter.matchPath("/users", "/users/:id"), null, "too short")
    }

    runTest("matchPath splat captures the tail") {
        expectEq(
            PyreonRouter.matchPath("/blog/2026/may/post", "/blog/:rest*"),
            mapOf("rest" to "2026/may/post"),
            "splat tail",
        )
        expectEq(
            PyreonRouter.matchPath("/files/readme", "/files/:path*"),
            mapOf("path" to "readme"),
            "splat single segment",
        )
    }

    runTest("matchPath splat requires one segment") {
        expectEq(PyreonRouter.matchPath("/blog", "/blog/:rest*"), null, "splat one-or-more")
    }

    runTest("matchPath splat composes after a :param") {
        expectEq(
            PyreonRouter.matchPath("/u/42/files/a/b", "/u/:id/files/:rest*"),
            mapOf("id" to "42", "rest" to "a/b"),
            "param + splat",
        )
    }

    runTest("matchPath optional :name? present or omitted") {
        expectEq(PyreonRouter.matchPath("/users/7", "/users/:id?"), mapOf("id" to "7"), "optional present")
        expectEq(PyreonRouter.matchPath("/users", "/users/:id?"), emptyMap(), "optional omitted")
        expectEq(PyreonRouter.matchPath("/users", "/users/:id?/edit"), null, "required after optional missing")
        expectEq(PyreonRouter.matchPath("/users/7/extra", "/users/:id?"), null, "longer than full pattern")
    }

    runTest("matchPath tolerates leading/trailing slashes") {
        expectEq(PyreonRouter.matchPath("/about/", "/about"), emptyMap(), "trailing slash")
        expectEq(PyreonRouter.matchPath("/about", "/about/"), emptyMap(), "pattern trailing slash")
        expectEq(PyreonRouter.matchPath("/users/7/", "/users/:id"), mapOf("id" to "7"), "param trailing slash")
        expectEq(PyreonRouter.matchPath("/", "/"), emptyMap(), "root")
    }

    // Round-1 audit fix — loaderData LRU bound (Class C unbounded cache).
    // Pre-fix the map grew monotonically across navigations; cap is 50.

    runTest("loaderData under cap keeps all entries") {
        val router = PyreonRouter()
        for (i in 0 until 10) {
            router.setLoaderData("/path/$i", "value-$i")
        }
        expectEq(router.loaderData.value.size, 10, "all 10 entries present")
        for (i in 0 until 10) {
            expectEq(router.loaderData.value["/path/$i"], "value-$i", "entry $i still there")
        }
    }

    runTest("loaderData at cap evicts oldest on new key") {
        val router = PyreonRouter()
        for (i in 0..PyreonRouter.MAX_LOADER_ENTRIES) {
            router.setLoaderData("/path/$i", "value-$i")
        }
        expectEq(router.loaderData.value.size, PyreonRouter.MAX_LOADER_ENTRIES, "pinned at cap")
        // The first key inserted (/path/0) is evicted; the last is present.
        expect(router.loaderData.value["/path/0"] == null, "oldest key /path/0 was evicted")
        expect(
            router.loaderData.value["/path/${PyreonRouter.MAX_LOADER_ENTRIES}"] != null,
            "newest key still present",
        )
    }

    runTest("loaderData stays bounded under heavy navigation") {
        val router = PyreonRouter()
        for (i in 0 until 500) {
            router.setLoaderData("/p/$i", i)
        }
        expectEq(
            router.loaderData.value.size,
            PyreonRouter.MAX_LOADER_ENTRIES,
            "bounded at cap even after 500 distinct paths",
        )
    }

    runTest("loaderData overwrite of same key does not evict") {
        val router = PyreonRouter()
        for (v in 0 until 100) {
            router.setLoaderData("/same-path", v)
        }
        expectEq(router.loaderData.value.size, 1, "only one entry across 100 overwrites")
        expectEq(router.loaderData.value["/same-path"], 99, "latest value won")
    }

    // Round-2 follow-up — global beforeEach / afterEach guards.

    runTest("beforeEach allows when true") {
        val router = PyreonRouter()
        router.beforeEachGuards.add { _ -> true }
        router.push("/allowed")
        expectEq(router.path.value, listOf("/allowed"), "path advanced")
    }

    runTest("beforeEach blocks when false") {
        val router = PyreonRouter()
        router.beforeEachGuards.add { _ -> false }
        router.push("/blocked")
        expectEq(router.path.value, emptyList(), "path NOT mutated when blocked")
    }

    runTest("beforeEach blocks replace too") {
        val router = PyreonRouter(initialPath = listOf("/start"))
        router.beforeEachGuards.add { _ -> false }
        router.replace("/blocked")
        expectEq(router.path.value, listOf("/start"), "replace also gated")
    }

    runTest("beforeEach AND-chains; any false blocks") {
        val router = PyreonRouter()
        router.beforeEachGuards.add { _ -> true }
        router.beforeEachGuards.add { _ -> false }
        router.beforeEachGuards.add { _ -> true }
        router.push("/blocked")
        expectEq(router.path.value, emptyList(), "AND chain blocked")
    }

    runTest("beforeEach receives the candidate path") {
        val router = PyreonRouter()
        val seen = mutableListOf<String>()
        router.beforeEachGuards.add { p -> seen.add(p); true }
        router.push("/users")
        router.push("/users/42")
        expectEq(seen.toList(), listOf("/users", "/users/42"), "guard sees each candidate")
    }

    runTest("afterEach runs after the path commits") {
        val router = PyreonRouter()
        val observed = mutableListOf<String>()
        router.afterEachHooks.add { committed -> observed.add(committed) }
        router.push("/a")
        router.push("/b")
        expectEq(observed.toList(), listOf("/a", "/b"), "afterEach fan-out")
        expectEq(router.currentPath, "/b", "current path is the latest commit")
    }

    runTest("afterEach skipped when blocked") {
        val router = PyreonRouter()
        router.beforeEachGuards.add { _ -> false }
        var afterCount = 0
        router.afterEachHooks.add { _ -> afterCount += 1 }
        router.push("/blocked")
        expectEq(afterCount, 0, "afterEach did NOT fire on blocked push")
    }

    // ── Per-route beforeEnter (Phase 2 native-readiness gap fix, 2026-06-05) ──
    //
    // Per-route beforeEnter is the RuntimeApi-level analog of the web
    // router's `beforeEnter:` route config. Each RouteRecord carries an
    // optional guard; on push/replace, the matched record's guard runs
    // after the global beforeEach passes. Returning false BLOCKS
    // navigation entirely (URL unchanged) — matches web parity exactly.
    // Composed with global beforeEach: global first (short-circuits if
    // any deny), then per-route (same short-circuit semantic).

    runTest("beforeEnter allows when true") {
        val router = PyreonRouter()
        router.routes.value = listOf(
            RouteRecord(
                path = "/admin",
                component = {},
                beforeEnter = { _ -> true },
            ),
        )
        router.push("/admin")
        expectEq(router.path.value, listOf("/admin"), "beforeEnter true → navigation proceeds")
        expectEq(router.currentPath, "/admin", "currentPath is the new route")
    }

    runTest("beforeEnter blocks when false") {
        val router = PyreonRouter()
        router.routes.value = listOf(
            RouteRecord(
                path = "/admin",
                component = {},
                beforeEnter = { _ -> false },
            ),
        )
        router.push("/admin")
        expectEq(router.path.value, emptyList<String>(), "beforeEnter false → push blocked")
        expectEq(router.currentPath, "/", "currentPath stays at root")
    }

    runTest("beforeEnter blocks replace too") {
        val router = PyreonRouter(initialPath = listOf("/home"))
        router.routes.value = listOf(
            RouteRecord(
                path = "/admin",
                component = {},
                beforeEnter = { _ -> false },
            ),
        )
        router.replace("/admin")
        expectEq(router.path.value, listOf("/home"), "replace blocked by beforeEnter")
    }

    runTest("beforeEnter receives the candidate path") {
        val router = PyreonRouter()
        val seen = mutableListOf<String>()
        router.routes.value = listOf(
            RouteRecord(
                path = "/users/:id",
                component = {},
                beforeEnter = { p -> seen.add(p); true },
            ),
        )
        router.push("/users/42")
        expectEq(seen.toList(), listOf("/users/42"), "beforeEnter sees the candidate")
    }

    runTest("global beforeEach short-circuits before per-route beforeEnter") {
        val router = PyreonRouter()
        var perRouteCalled = false
        router.beforeEachGuards.add { _ -> false }
        router.routes.value = listOf(
            RouteRecord(
                path = "/admin",
                component = {},
                beforeEnter = { _ -> perRouteCalled = true; true },
            ),
        )
        router.push("/admin")
        expectEq(perRouteCalled, false, "per-route gate skipped when global denies")
        expectEq(router.path.value, emptyList<String>(), "blocked")
    }

    runTest("route without beforeEnter passes") {
        val router = PyreonRouter()
        router.routes.value = listOf(
            RouteRecord(path = "/home", component = {}),
        )
        router.push("/home")
        expectEq(router.path.value, listOf("/home"), "no guard → no block")
    }

    runTest("afterEach skipped when beforeEnter blocks") {
        val router = PyreonRouter()
        var afterCount = 0
        router.afterEachHooks.add { _ -> afterCount += 1 }
        router.routes.value = listOf(
            RouteRecord(
                path = "/admin",
                component = {},
                beforeEnter = { _ -> false },
            ),
        )
        router.push("/admin")
        expectEq(afterCount, 0, "afterEach skipped when beforeEnter blocks")
    }

    runTest("beforeEnter runs parent before child in nested chain") {
        val router = PyreonRouter()
        val order = mutableListOf<String>()
        router.routes.value = listOf(
            RouteRecord(
                path = "/app",
                children = listOf(
                    RouteRecord(
                        path = "/app/dashboard",
                        component = {},
                        beforeEnter = { _ -> order.add("child"); true },
                    ),
                ),
                beforeEnter = { _ -> order.add("parent"); true },
                component = {},
            ),
        )
        router.push("/app/dashboard")
        expectEq(order.toList(), listOf("parent", "child"), "parent runs before child")
        expectEq(router.path.value, listOf("/app/dashboard"), "navigation commits")
    }

    runTest("beforeEnter parent deny blocks child") {
        val router = PyreonRouter()
        var childCalled = false
        router.routes.value = listOf(
            RouteRecord(
                path = "/app",
                children = listOf(
                    RouteRecord(
                        path = "/app/dashboard",
                        component = {},
                        beforeEnter = { _ -> childCalled = true; true },
                    ),
                ),
                beforeEnter = { _ -> false },
                component = {},
            ),
        )
        router.push("/app/dashboard")
        expectEq(childCalled, false, "child gate skipped when parent denies")
        expectEq(router.path.value, emptyList<String>(), "blocked")
    }

    runTest("beforeEnter can redirect via router.redirect") {
        var routerVar: PyreonRouter? = null
        val router = PyreonRouter()
        routerVar = router
        router.routes.value = listOf(
            RouteRecord(
                path = "/admin",
                component = {},
                beforeEnter = { _ ->
                    routerVar?.redirect("/login")
                    false
                },
            ),
            RouteRecord(
                path = "/login",
                component = {},
            ),
        )
        router.push("/admin")
        expectEq(router.currentPath, "/login", "redirect inside beforeEnter lands at /login")
    }

    // Throw-redirect pattern — router.redirect(path) inside a guard.

    runTest("redirect outside guard acts like replace") {
        val router = PyreonRouter(initialPath = listOf("/home"))
        router.redirect("/login")
        expectEq(router.path.value, listOf("/login"), "outside-guard redirect == replace")
    }

    runTest("redirect from guard sets target + blocks original") {
        val router = PyreonRouter()
        router.beforeEachGuards.add { path ->
            if (path != "/login") {
                router.redirect("/login")
                false
            } else {
                true
            }
        }
        router.push("/profile")
        expectEq(router.currentPath, "/login", "redirect target wins")
    }

    runTest("redirect target itself is allowed (no infinite recursion)") {
        val router = PyreonRouter()
        var guardCalls = 0
        router.beforeEachGuards.add { path ->
            guardCalls += 1
            if (path == "/admin") {
                router.redirect("/login")
                false
            } else {
                true
            }
        }
        router.push("/admin")
        expectEq(guardCalls, 1, "guard fired ONCE — nested redirect skipped re-check")
        expectEq(router.currentPath, "/login", "ended at redirect target")
    }

    runTest("redirect from guard skips afterEach") {
        val router = PyreonRouter()
        val afterCalls = mutableListOf<String>()
        router.afterEachHooks.add { p -> afterCalls.add(p) }
        router.beforeEachGuards.add { path ->
            if (path == "/admin") {
                router.redirect("/login")
                false
            } else {
                true
            }
        }
        router.push("/admin")
        expectEq(afterCalls.toList(), emptyList(), "no afterEach fires for redirect case")
    }

    // Phase A4 — Route table dispatcher (closes CRIT-2 partial + CRIT-3 partial)
    // 2026-06 native readiness audit. Backwards-compat: apps that don't
    // configure `routes` keep pre-A4 behavior (params stays empty,
    // RouterView is no-op). Apps that DO configure `routes` get
    // matchPath-driven dispatch and useParams populates per navigation.

    runTest("A4 backwards-compat: no routes → params stays empty") {
        val router = PyreonRouter()
        router.push("/users/42")
        expectEq(router.params.value, emptyMap(), "no route table → no params populated")
        router.replace("/users/99")
        expectEq(router.params.value, emptyMap(), "replace too — pre-A4 behavior preserved")
    }

    runTest("A4 push populates params from matched route (CRIT-3 fix)") {
        val router = PyreonRouter(routes = listOf(
            RouteRecord("/users/:id") {},
            RouteRecord("/posts/:slug/edit") {},
        ))
        router.push("/users/42")
        expectEq(router.params.value, mapOf("id" to "42"), "users/:id matched")
        router.push("/posts/hello-world/edit")
        expectEq(router.params.value, mapOf("slug" to "hello-world"), "posts/:slug/edit matched")
    }

    runTest("A4 replace populates params from matched route") {
        val router = PyreonRouter(routes = listOf(
            RouteRecord("/users/:id") {},
        ))
        router.replace("/users/abc")
        expectEq(router.params.value, mapOf("id" to "abc"), "replace populates params")
    }

    runTest("A4 no match clears params (stale params don't leak)") {
        val router = PyreonRouter(routes = listOf(
            RouteRecord("/users/:id") {},
        ))
        router.push("/users/42")
        expectEq(router.params.value, mapOf("id" to "42"), "matched")
        router.push("/about")  // no match
        expectEq(router.params.value, emptyMap(), "no match → params cleared")
    }

    runTest("A4 back() recomputes params from previous route") {
        val router = PyreonRouter(routes = listOf(
            RouteRecord("/users/:id") {},
            RouteRecord("/posts/:slug") {},
        ))
        router.push("/users/1")
        router.push("/posts/hello")
        expectEq(router.params.value, mapOf("slug" to "hello"), "before back: posts/:slug")
        router.back()
        expectEq(router.params.value, mapOf("id" to "1"), "after back: previous route's params")
    }

    runTest("A4 resolveCurrentRoute returns matched record") {
        val router = PyreonRouter(routes = listOf(
            RouteRecord("/") {},
            RouteRecord("/users/:id") {},
        ))
        router.push("/users/7")
        val resolved = router.resolveCurrentRoute()
        expect(resolved != null, "resolved should be non-null")
        expectEq(resolved!!.first.path, "/users/:id", "matched record's path")
        expectEq(resolved.second, mapOf("id" to "7"), "matched record's params")
    }

    runTest("A4 resolveCurrentRoute returns null on no match") {
        val router = PyreonRouter(routes = listOf(
            RouteRecord("/users/:id") {},
        ))
        router.push("/about")
        expect(router.resolveCurrentRoute() == null, "no match → null")
    }

    runTest("A4 declaration order is precedence (first match wins)") {
        val router = PyreonRouter(routes = listOf(
            RouteRecord("/:type/:id") {},  // catch-all FIRST
            RouteRecord("/users/:id") {},  // more specific, declared 2nd
        ))
        router.push("/users/42")
        val resolved = router.resolveCurrentRoute()
        expectEq(resolved!!.first.path, "/:type/:id", "first declared wins")
        expectEq(resolved.second, mapOf("type" to "users", "id" to "42"), "matched the catch-all")
    }

    runTest("A4 initial path populates params at construction time") {
        val router = PyreonRouter(
            initialPath = listOf("/users/42"),
            routes = listOf(RouteRecord("/users/:id") {}),
        )
        expectEq(router.params.value, mapOf("id" to "42"), "params populated by init resolver")
    }

    // Phase B8 — forward() + canGoForward + history semantics
    // 2026-06 native readiness audit. Closes scout-5's "no forward()"
    // finding. Mirror of Swift impl on Kotlin/Compose side.

    runTest("B8 canGoForward starts false") {
        val router = PyreonRouter(initialPath = listOf("/home"))
        expect(!router.canGoForward, "initial: no forward history")
        router.push("/about")
        expect(!router.canGoForward, "after push: no forward history")
    }

    runTest("B8 back() enables forward(); forward() re-navigates") {
        val router = PyreonRouter(initialPath = listOf("/home"))
        router.push("/about")
        expectEq(router.currentPath, "/about", "after push")
        router.back()
        expectEq(router.currentPath, "/home", "after back")
        expect(router.canGoForward, "back populated forward stack")
        router.forward()
        expectEq(router.currentPath, "/about", "forward replayed")
        expect(!router.canGoForward, "forward stack drained")
    }

    runTest("B8 forward() is no-op when stack empty") {
        val router = PyreonRouter(initialPath = listOf("/home"))
        router.forward()
        expectEq(router.currentPath, "/home", "unchanged")
    }

    runTest("B8 push() clears forward history") {
        val router = PyreonRouter(initialPath = listOf("/home"))
        router.push("/a")
        router.push("/b")
        router.back()
        expect(router.canGoForward, "back populated")
        router.push("/c")
        expect(!router.canGoForward, "new push cleared forward")
    }

    runTest("B8 replace() clears forward history") {
        val router = PyreonRouter(initialPath = listOf("/home"))
        router.push("/a")
        router.back()
        expect(router.canGoForward, "back populated")
        router.replace("/b")
        expect(!router.canGoForward, "replace cleared forward")
    }

    runTest("B8 reset() clears both stacks") {
        val router = PyreonRouter(initialPath = listOf("/a", "/b", "/c"))
        router.back()  // forward stack = [/c]
        expect(router.canGoForward, "back populated")
        router.reset()
        expect(!router.canGoForward, "reset cleared forward")
        expectEq(router.path.value, emptyList(), "path also cleared")
    }

    runTest("B8 multi-back / multi-forward preserves order") {
        val router = PyreonRouter(initialPath = listOf("/home"))
        router.push("/a")
        router.push("/b")
        router.push("/c")
        expectEq(router.path.value, listOf("/home", "/a", "/b", "/c"), "after 3 pushes")
        router.back()
        router.back()
        expectEq(router.currentPath, "/a", "after 2 backs")
        router.forward()
        expectEq(router.currentPath, "/b", "forward to /b")
        router.forward()
        expectEq(router.currentPath, "/c", "forward to /c")
        expect(!router.canGoForward, "drained")
    }

    // Phase A7 — Disposer-returning guard registration (Class C fix)
    // 2026-06 native readiness audit. `beforeEachGuards.add(...)` /
    // `afterEachHooks.add(...)` grow unboundedly; `addBeforeEach` /
    // `addAfterEach` return a disposer for lifecycle-bound cleanup.

    runTest("A7 addBeforeEach registers a guard that fires on push") {
        val router = PyreonRouter()
        var fired = false
        router.addBeforeEach { _ -> fired = true; true }
        router.push("/x")
        expect(fired, "guard fired on push")
        expectEq(router.currentPath, "/x", "nav succeeded")
    }

    runTest("A7 addBeforeEach disposer removes ONLY that guard") {
        val router = PyreonRouter()
        var aFires = 0
        var bFires = 0
        val disposeA = router.addBeforeEach { _ -> aFires += 1; true }
        router.addBeforeEach { _ -> bFires += 1; true }
        router.push("/1")
        expectEq(aFires, 1, "A fired on push 1")
        expectEq(bFires, 1, "B fired on push 1")
        disposeA()
        router.push("/2")
        expectEq(aFires, 1, "A removed — no second fire")
        expectEq(bFires, 2, "B still attached")
    }

    runTest("A7 addBeforeEach disposer is idempotent") {
        val router = PyreonRouter()
        var fires = 0
        val dispose = router.addBeforeEach { _ -> fires += 1; true }
        dispose()
        dispose()  // no-op, no crash
        router.push("/x")
        expectEq(fires, 0, "guard removed; no fire")
    }

    runTest("A7 addBeforeEach returning false blocks navigation") {
        val router = PyreonRouter()
        router.addBeforeEach { path -> path != "/blocked" }
        router.push("/ok")
        expectEq(router.currentPath, "/ok", "ok path nav succeeded")
        router.push("/blocked")
        expectEq(router.currentPath, "/ok", "blocked path rejected")
    }

    runTest("A7 disposable + legacy guards coexist; legacy walks first") {
        val router = PyreonRouter()
        val order = mutableListOf<String>()
        router.beforeEachGuards.add { _ -> order.add("legacy"); true }
        router.addBeforeEach { _ -> order.add("disposable"); true }
        router.push("/x")
        expectEq(order.toList(), listOf("legacy", "disposable"), "legacy first, then disposable")
    }

    runTest("A7 addAfterEach + disposer mirror addBeforeEach") {
        val router = PyreonRouter()
        val fires = mutableListOf<String>()
        val dispose = router.addAfterEach { p -> fires.add(p) }
        router.push("/a")
        router.push("/b")
        expectEq(fires.toList(), listOf("/a", "/b"), "both pushes fired the hook")
        dispose()
        router.push("/c")
        expectEq(fires.toList(), listOf("/a", "/b"), "after dispose: no more fires")
    }

    runTest("A7 clearDisposableBeforeEachGuards keeps legacy intact") {
        val router = PyreonRouter()
        var legacyFires = 0
        var disposableFires = 0
        router.beforeEachGuards.add { _ -> legacyFires += 1; true }
        router.addBeforeEach { _ -> disposableFires += 1; true }
        router.addBeforeEach { _ -> disposableFires += 1; true }
        router.clearDisposableBeforeEachGuards()
        router.push("/x")
        expectEq(legacyFires, 1, "legacy still attached")
        expectEq(disposableFires, 0, "all disposable cleared")
    }

    runTest("A7 clearDisposableAfterEachHooks keeps legacy intact") {
        val router = PyreonRouter()
        var legacyFires = 0
        var disposableFires = 0
        router.afterEachHooks.add { _ -> legacyFires += 1 }
        router.addAfterEach { _ -> disposableFires += 1 }
        router.addAfterEach { _ -> disposableFires += 1 }
        router.clearDisposableAfterEachHooks()
        router.push("/x")
        expectEq(legacyFires, 1, "legacy still attached")
        expectEq(disposableFires, 0, "all disposable cleared")
    }

    // Phase A6 — Wildcard-404 catch-all (builds on A4)
    // 2026-06 native readiness audit. RouterView renders
    // notFoundComponent on no-match instead of falling through
    // silently. Backward-compat: null notFoundComponent keeps
    // pre-A6 behavior.

    runTest("A6 notFoundComponent defaults to null (pre-A6 unchanged)") {
        val router = PyreonRouter()
        expect(router.notFoundComponent.value == null, "default is null")
    }

    runTest("A6 constructor accepts notFoundComponent and stores it") {
        val router = PyreonRouter(
            routes = listOf(RouteRecord("/") {}),
            notFoundComponent = {},
        )
        expect(router.notFoundComponent.value != null, "stored from constructor")
    }

    runTest("A6 notFoundComponent runtime assign works") {
        val router = PyreonRouter()
        expect(router.notFoundComponent.value == null, "starts null")
        router.notFoundComponent.value = {}
        expect(router.notFoundComponent.value != null, "after assign: set")
    }

    runTest("A6 notFoundComponent does NOT intercept matched routes") {
        val router = PyreonRouter(
            routes = listOf(RouteRecord("/users/:id") {}),
            notFoundComponent = {},
        )
        router.push("/users/7")
        expectEq(router.params.value, mapOf("id" to "7"), "matched route still wins")
        expect(router.resolveCurrentRoute() != null, "match still resolves")
    }

    runTest("A6 notFoundComponent no-match keeps params empty") {
        val router = PyreonRouter(
            routes = listOf(RouteRecord("/users/:id") {}),
            notFoundComponent = {},
        )
        router.push("/about")  // no match
        expectEq(router.params.value, emptyMap(), "no match → params empty")
        expect(router.resolveCurrentRoute() == null, "no resolve")
        // The 404 is RouterView's render-time fallback. The router
        // model itself doesn't pretend the no-match path was matched
        // by some catch-all route.
    }

    // Phase A4.5 — Nested route depth indexing (closes rest of CRIT-2)
    // 2026-06 native readiness audit. RouteRecord gains `children`;
    // router walks the tree recursively; matched chain has one entry
    // per nesting level. params is MERGED across the chain.

    runTest("A4.5 flat routes yield single-entry chain (backward-compat)") {
        val router = PyreonRouter(routes = listOf(
            RouteRecord("/about") {},
        ))
        router.push("/about")
        val chain = router.resolveCurrentChain()
        expectEq(chain?.size, 1, "single entry")
        expectEq(chain?.get(0)?.first?.path, "/about", "matched the leaf")
    }

    runTest("A4.5 nested route yields parent-child chain") {
        val router = PyreonRouter(routes = listOf(
            RouteRecord(
                "/app",
                children = listOf(
                    RouteRecord("/app/dashboard") {},
                    RouteRecord("/app/profile") {},
                ),
            ) {},
        ))
        router.push("/app/dashboard")
        val chain = router.resolveCurrentChain()
        expectEq(chain?.size, 2, "parent + child = 2 entries")
        expectEq(chain?.get(0)?.first?.path, "/app", "parent at depth 0")
        expectEq(chain?.get(1)?.first?.path, "/app/dashboard", "child at depth 1")
    }

    runTest("A4.5 parent exact match wins over children") {
        val router = PyreonRouter(routes = listOf(
            RouteRecord(
                "/app",
                children = listOf(
                    RouteRecord("/app/dashboard") {},
                ),
            ) {},
        ))
        router.push("/app")  // exact parent match
        val chain = router.resolveCurrentChain()
        expectEq(chain?.size, 1, "single entry — exact match")
        expectEq(chain?.get(0)?.first?.path, "/app", "matched the parent")
    }

    runTest("A4.5 nested params merge across chain") {
        val router = PyreonRouter(routes = listOf(
            RouteRecord(
                "/t/:tenant",
                children = listOf(
                    RouteRecord("/t/:tenant/users/:id") {},
                ),
            ) {},
        ))
        router.push("/t/acme/users/42")
        expectEq(
            router.params.value,
            mapOf("tenant" to "acme", "id" to "42"),
            "merged params across chain",
        )
        val chain = router.resolveCurrentChain()
        expectEq(chain?.size, 2, "parent + child")
        expectEq(chain?.get(0)?.second, emptyMap(), "parent didn't match → empty params at depth 0")
        expectEq(
            chain?.get(1)?.second,
            mapOf("tenant" to "acme", "id" to "42"),
            "leaf matched → full params at depth 1",
        )
    }

    runTest("A4.5 no-match clears params") {
        val router = PyreonRouter(routes = listOf(
            RouteRecord(
                "/app",
                children = listOf(
                    RouteRecord("/app/dashboard") {},
                ),
            ) {},
        ))
        router.push("/app/dashboard")
        expect(router.resolveCurrentChain() != null, "matched chain present")
        router.push("/unrelated")  // no match
        expect(router.resolveCurrentChain() == null, "no match → null chain")
        expectEq(router.params.value, emptyMap(), "params cleared on no-match")
    }

    runTest("A4.5 three-level nesting yields three-entry chain") {
        val router = PyreonRouter(routes = listOf(
            RouteRecord(
                "/a",
                children = listOf(
                    RouteRecord(
                        "/a/b",
                        children = listOf(
                            RouteRecord("/a/b/c") {},
                        ),
                    ) {},
                ),
            ) {},
        ))
        router.push("/a/b/c")
        val chain = router.resolveCurrentChain()
        expectEq(chain?.size, 3, "deep nesting → 3 entries")
        expectEq(chain?.get(0)?.first?.path, "/a", "level 0")
        expectEq(chain?.get(1)?.first?.path, "/a/b", "level 1")
        expectEq(chain?.get(2)?.first?.path, "/a/b/c", "level 2")
    }

    runTest("A4.5 resolveCurrentRoute returns TOP of chain (back-compat)") {
        val router = PyreonRouter(routes = listOf(
            RouteRecord(
                "/app",
                children = listOf(
                    RouteRecord("/app/dashboard") {},
                ),
            ) {},
        ))
        router.push("/app/dashboard")
        expectEq(
            router.resolveCurrentRoute()?.first?.path,
            "/app",
            "TOP of chain is the parent (back-compat for A4 API)",
        )
    }

    println("[verify-kotlin] ✓ PyreonRouter smoke ${69} test(s) passed")
}
