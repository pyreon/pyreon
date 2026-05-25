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

    println("[verify-kotlin] ✓ PyreonRouter smoke ${9} test(s) passed")
}
