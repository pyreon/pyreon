---
'@pyreon/create-multiplatform': patch
---

Drop the "native toolchain is not published, `npm install` will 404" notice —
it ships in the same release that publishes the toolchain, so from this version
on the notice would be the lie in the other direction.

While `@pyreon/native-cli` and the Swift/Kotlin runtimes were `private: true`,
the scaffolder deliberately warned after every scaffold and in the emitted
README that the native targets could not be built from a standalone checkout.
The stack is now publishable and rides the same fixed release group as this
package, so the published `create-multiplatform` and the packages it declares
always appear on npm together. The terminal notice is replaced by a one-line
pointer to `npm run build:ios` / `build:android`; the README's warning block is
replaced by the working contract (everything installs from npm; native builds
need the local platform SDKs — Xcode + xcodegen, Android SDK + Gradle).

The installability ratchet stays: `scaffold-deps-installable.test.ts` still
fails if any scaffolded `@pyreon/*` dependency is `private: true` in the
workspace, and its README assertion now checks the stale warning can never
come back (bisect-verified — restoring the old README fails exactly that
spec).
