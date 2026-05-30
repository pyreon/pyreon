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

    println("[verify-kotlin] ✓ PyreonRouter smoke ${22} test(s) passed")
}
