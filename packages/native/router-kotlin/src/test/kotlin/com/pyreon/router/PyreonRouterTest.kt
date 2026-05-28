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

    runTest("matchPath tolerates leading/trailing slashes") {
        expectEq(PyreonRouter.matchPath("/about/", "/about"), emptyMap(), "trailing slash")
        expectEq(PyreonRouter.matchPath("/about", "/about/"), emptyMap(), "pattern trailing slash")
        expectEq(PyreonRouter.matchPath("/users/7/", "/users/:id"), mapOf("id" to "7"), "param trailing slash")
        expectEq(PyreonRouter.matchPath("/", "/"), emptyMap(), "root")
    }

    println("[verify-kotlin] ✓ PyreonRouter smoke ${16} test(s) passed")
}
