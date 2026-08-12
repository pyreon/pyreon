---
'@pyreon/native-compiler': minor
'@pyreon/a11y': minor
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

`@pyreon/a11y`'s `announce(...)` works on iOS + Android, and its native runtime is **co-located in the package** (`@pyreon/a11y/native/{swift,kotlin}/`) — the per-package architecture, not the monolithic `@pyreon/native-runtime-*`.

**Runtime (co-located) — `PyreonA11y`:**
- Swift: `announce(_:assertive:)` posts a VoiceOver announcement (`UIAccessibility.post(.announcement)`), raising the iOS 17+ speech priority when `assertive`.
- Kotlin: `announce(message, assertive)` routes to a registered announcer (`PyreonA11y.setAnnouncer { rootView.announceForAccessibility(it) }`), the "Android needs a host" seam — a safe no-op before wiring.

Ships in `@pyreon/a11y/native/`, declared via the `pyreon.native` field, so `pyreon-native wire` aggregates it from the installed package. The co-source verify gate (`scripts/check-native-cosource.ts`, wired into native-validate CI) compiles + smoke-runs it against the stub harness — the Kotlin announcer seam is asserted, the Swift wrapper typechecks.

**Lowering:** `announce("m")` → `PyreonA11y.announce("m", assertive: false)`; `announce("m", { politeness: 'assertive' })` → `assertive: true`. Message is any expression; a renamed import (`announce as say`) is handled. A new `announce-call` ExprIR kind is threaded through `parse` (gated on the `@pyreon/a11y` import) + both emits + the `expr-utils` walkers + `infer-type`.

The **DOM-based helpers stay web-only** — `VisuallyHidden` / `LiveRegion` / `SkipLink` / `createA11yId` still warn (per-export, `announce` excepted).

Proven R2 (emit) + R3 (typecheck vs the compiler's `PyreonA11y` stubs on swiftc + kotlinc); `native-a11y.test.ts` 7 cases + the co-source gate. Full native-compiler suite 2818 pass (fixing two tests that had encoded the old "announce warns" behavior). No device proof yet; `politeness` isn't distinguished on Android.
