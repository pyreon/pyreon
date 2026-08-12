// Smoke tests for PyreonPermissions — the Compose `usePermissions`
// reactive permission set. Dependency-free `check(...)` harness; runs via
// `verify-kotlin.ts --service=PyreonPermissions`.

package com.pyreon.runtime

fun testPermsExactMatch() {
    val p = PyreonPermissions(setOf("posts.edit"))
    check(p.can("posts.edit")) { "exact grant matches" }
    check(!p.can("posts.delete")) { "ungranted key denied" }
    check(p.cannot("posts.delete")) { "cannot is inverse" }
}

fun testPermsWildcard() {
    val p = PyreonPermissions(setOf("posts.*"))
    check(p.can("posts.edit")) { "wildcard matches posts.edit" }
    check(p.can("posts.delete")) { "wildcard matches posts.delete" }
    check(!p.can("users.edit")) { "wildcard scoped to its prefix" }
    check(!p.can("postsX")) { "wildcard is segment-prefix, not substring" }
}

fun testPermsNotParity() {
    // Web-API parity: source code calls `can.not("k")` — the runtime
    // must carry `not` alongside the Kotlin-flavored `cannot`.
    val p = PyreonPermissions(setOf("posts.edit"))
    check(p.not("posts.delete")) { "not inverts an ungranted key" }
    check(!p.not("posts.edit")) { "not is false for a granted key" }
}

fun testPermsAllAny() {
    val p = PyreonPermissions(setOf("a", "b"))
    check(p.all("a", "b")) { "all granted" }
    check(!p.all("a", "c")) { "all fails when one missing" }
    check(p.any("a", "c")) { "any matches one" }
    check(!p.any("c", "d")) { "any fails when none" }
}

fun testPermsMutation() {
    val p = PyreonPermissions()
    check(!p.can("admin")) { "empty denies" }
    p.grant("admin")
    check(p.can("admin")) { "grant adds" }
    p.revoke("admin")
    check(!p.can("admin")) { "revoke removes" }
    p.set(setOf("x", "y"))
    check(p.can("x") && p.can("y") && !p.can("admin")) { "set replaces" }
}

fun main() {
    testPermsExactMatch()
    testPermsNotParity()
    testPermsWildcard()
    testPermsAllAny()
    testPermsMutation()
    println("[PyreonPermissionsTest] all smoke tests passed")
}
