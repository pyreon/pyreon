// PyreonPermissions behavior — standalone assertion program the co-source
// verify gate compiles with ../swift/PyreonPermissions.swift (-parse-as-library)
// and runs. Byte-aligned with PyreonPermissionsTest.kt + the web usePermissions tests.

import Foundation

@main
struct PyreonPermissionsTests {
    static func check(_ c: Bool, _ m: String) { if !c { fatalError("PyreonPermissionsTests: \(m)") } }

    static func main() {
        if #available(iOS 17.0, macOS 14.0, *) { run() }
        print("[PyreonPermissionsTests] all assertions passed")
    }

    @available(iOS 17.0, macOS 14.0, *)
    static func run() {
        // exact match; ungranted denied; cannot inverts
        var perms = PyreonPermissions(["posts.edit"])
        check(perms.can("posts.edit"), "exact grant matches")
        check(!perms.can("posts.delete"), "ungranted denied")
        check(perms.cannot("posts.delete"), "cannot inverts")

        // "posts.*" wildcard is segment-scoped
        perms = PyreonPermissions(["posts.*"])
        check(perms.can("posts.edit"), "wildcard posts.edit")
        check(perms.can("posts.delete"), "wildcard posts.delete")
        check(!perms.can("users.edit"), "wildcard is namespace-scoped")
        check(!perms.can("postsX"), "wildcard is segment-prefix, not substring")

        // not() = web-parity inverse
        perms = PyreonPermissions(["posts.edit"])
        check(perms.not("posts.delete"), "not() true for denied")
        check(!perms.not("posts.edit"), "not() false for granted")

        // all requires every; any requires one
        perms = PyreonPermissions(["a", "b"])
        check(perms.all("a", "b"), "all present")
        check(!perms.all("a", "c"), "all missing one")
        check(perms.any("a", "c"), "any has one")
        check(!perms.any("c", "d"), "any has none")

        // grant / revoke / set mutate reactively
        perms = PyreonPermissions()
        check(!perms.can("admin"), "initially ungranted")
        perms.grant("admin")
        check(perms.can("admin"), "granted")
        perms.revoke("admin")
        check(!perms.can("admin"), "revoked")
        perms.set(["x", "y"])
        check(perms.can("x") && perms.can("y") && !perms.can("admin"), "set replaces the granted set")
    }
}
