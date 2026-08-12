---
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

`@pyreon/a11y`'s `announce(...)` now works on iOS + Android — screen-reader announcements lower to a native `PyreonA11y` runtime (was warned unlowered, and the call emitted verbatim → a silent native-build break).

**Runtime — `PyreonA11y`:**
- Swift: `PyreonA11y.announce(_:assertive:)` posts a VoiceOver announcement (`UIAccessibility.post(.announcement)`), raising the iOS 17+ speech priority when `assertive`.
- Kotlin: `PyreonA11y.announce(message, assertive)` routes to a registered announcer — the app wires it once (`PyreonA11y.setAnnouncer { text -> rootView.announceForAccessibility(text) }`), the same "Android needs a host" seam as `PyreonNetworkStatus` / `PyreonPush` (Android has no context-free announcement channel). Before wiring it is a safe no-op. Verified: `verify-kotlin --service=PyreonA11y` (typecheck + a smoke that the announcer receives each message).

**Lowering:** `announce("msg")` → `PyreonA11y.announce("msg", assertive: false)`; `announce("msg", { politeness: 'assertive' })` → `assertive: true`. The message is any expression; a renamed import (`announce as say`) is handled. A new `announce-call` ExprIR kind is threaded through `parse` (gated on the `@pyreon/a11y` import) + both emits + the exhaustive `expr-utils` walkers + `infer-type`.

The **DOM-based helpers stay web-only** — `VisuallyHidden` / `LiveRegion` / `SkipLink` / `createA11yId` still warn (per-export, with `announce` excepted), and native a11y for elements continues through the `accessibilityLabel` / `accessibilityHidden` props.

Proven R2 (emit) + R3 (typecheck against the `PyreonA11y` stubs on both real toolchains — `swiftc` + `kotlinc`); `native-a11y.test.ts` 7 cases. No device proof yet — the Kotlin seam is smoke-tested and the emit is stub-typechecked; the Swift runtime is a thin `UIAccessibility` wrapper (device-only, like `accessibilityLabel`). `politeness` is not yet distinguished on Android (one announcement level); a `clear` option is dropped.
