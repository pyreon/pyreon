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

        // The case the old "segment-scoped" comment claimed but no
        // assertion covered — and where the bug lived. `.*` is ONE
        // segment; a bare prefix match also granted every nested
        // namespace, so the same source granted more on device than in
        // the browser. Measured against the web resolver, not assumed.
        check(!perms.can("posts.comments.edit"), ".* does NOT reach a nested namespace")
        check(!perms.can("posts"), ".* does not grant its own prefix")

        // `.**` is the recursive form, most-specific ancestor first.
        // Previously unrecognised entirely, so it granted nothing.
        perms = PyreonPermissions(["posts.**"])
        check(perms.can("posts.edit"), ".** covers one segment")
        check(perms.can("posts.comments.edit"), ".** covers any depth")
        check(!perms.can("users.edit"), ".** stays inside its prefix")

        // `*` grants everything — also previously unrecognised.
        perms = PyreonPermissions(["*"])
        check(perms.can("anything.deep.key"), "* grants any key at any depth")

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
