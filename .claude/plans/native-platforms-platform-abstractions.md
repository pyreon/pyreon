# PMTC platform abstractions — package shape spec

**Status**: Companion to [`native-platforms.md`](./native-platforms.md) (PMTC strategic direction, #764), [`native-platforms-phase0-roadmap.md`](./native-platforms-phase0-roadmap.md) (#797 merged), and [`native-platforms-todomvc-walkthrough.md`](./native-platforms-todomvc-walkthrough.md) (#799). Formalizes the per-platform abstraction layer mechanism the PMTC plan named but didn't fully scope.

**Scope**: This doc specifies the **package-split convention** and the **compiler binding-resolution mechanism** that lets one Pyreon source call platform APIs (storage, camera, push, biometrics, deep links) and have the compiler resolve the right per-platform implementation per target.

**Out of scope**: Implementation of any specific abstraction package. This doc defines the SHAPE; concrete packages ship in Phase 1+ following this shape.

---

## TL;DR

PMTC's per-platform abstraction layer follows a **three-package split** per abstraction:

```
@pyreon/<abstraction>          — interface + web (JS/DOM) implementation
@pyreon/<abstraction>-ios      — Swift package implementing the interface for iOS
@pyreon/<abstraction>-android  — Kotlin module implementing the interface for Android
```

The user installs only `@pyreon/<abstraction>`. The compiler, at native-target build time, detects the import and resolves the platform binding via:

1. **Build-time substitution**: web target uses the `@pyreon/<abstraction>` JS export directly; iOS/Android targets emit native source that calls into `@pyreon/<abstraction>-ios` / `-android` (linked as SPM / Maven dependencies of the generated Xcode / Android Studio project).
2. **A static **`PYREON_NATIVE_BINDINGS` manifest\*\* in each abstract package's `package.json` declaring which functions/hooks should be substituted, with what shape per platform. The compiler reads this manifest to know what to substitute.
3. **A validation pass** at build time that asserts every consumed binding has implementations for every targeted platform; missing implementations fail the build with a clear error.

This doc specifies the manifest format, the resolution algorithm, the package-split conventions, and an end-to-end walkthrough using `@pyreon/storage` as the reference case.

---

## Why this needs a spec

The PMTC plan named the pattern (`@pyreon/camera` example) but left the mechanism implicit. The TodoMVC walkthrough (#799) hit it with `useStorage('todos', [])` — the walkthrough proposed a three-package split BUT didn't specify how the compiler resolves which implementation to emit.

Without a spec:

1. **Every abstraction package would invent its own resolution shape.** Three packages = three slightly-different splits = no consumer mental model.
2. **The compiler would need ad-hoc per-package recognition rules.** `useStorage` is recognized, but `useCamera` isn't until a separate compiler PR is written. Doesn't scale.
3. **Missing implementations would fail silently or cryptically.** If a user imports `useBiometrics` but the iOS implementation hasn't shipped, the build emits Swift that calls a non-existent type — error surfaces at `swiftc -parse` time with a confusing "no such symbol" message instead of "PMTC: `@pyreon/biometrics` has no iOS implementation."

A **manifest-driven** resolution mechanism solves all three. The compiler doesn't need per-package recognition rules — it just reads the manifest in each abstract package's `package.json`. New abstractions ship by adding a manifest entry, not by extending the compiler.

This shape mirrors Pyreon's existing manifest-driven docs pipeline (per `@pyreon/manifest` in the existing `CLAUDE.md`) — same conceptual model, applied to native-binding resolution.

---

## The package split

### Per-abstraction structure

```
packages/
  fundamentals/
    storage/                       — @pyreon/storage (current; web-only today)
  native/
    abstractions/
      storage-ios/                 — @pyreon/storage-ios (Swift package)
      storage-android/             — @pyreon/storage-android (Kotlin AAR/Maven module)
      camera/                      — @pyreon/camera (TypeScript abstract interface + web impl)
      camera-ios/                  — @pyreon/camera-ios
      camera-android/              — @pyreon/camera-android
      push-ios/                    — @pyreon/push-ios
      push-android/                — @pyreon/push-android
      ...
```

Web-relevant abstractions (storage, deep-links — anything that has a meaningful web implementation) keep their existing `packages/fundamentals/<name>/` location and gain native sibling packages under `packages/native/abstractions/<name>-{ios,android}/`. Mobile-only abstractions (camera, push, biometrics — anything web can't reasonably do today) live entirely under `packages/native/abstractions/<name>/` with the abstract interface and the per-platform implementations as sibling directories.

### What each package contains

**`@pyreon/<abstraction>`** (abstract interface + web impl):

- `src/index.ts` — exports the abstract API (hooks, types, constants)
- `src/web.ts` — web/JS implementation of the abstract API
- `package.json` — declares the manifest under `PYREON_NATIVE_BINDINGS` (spec below)
- Standard Pyreon package conventions (lint, typecheck, vitest, manifest for docs pipeline)

**`@pyreon/<abstraction>-ios`** (Swift):

- `Package.swift` — Swift Package Manager declaration, iOS 17+ target
- `Sources/<Module>/` — Swift source implementing the abstract API
- `Tests/<Module>Tests/` — XCTest specs
- A small `pyreon.json` manifest declaring the exported symbols + their Pyreon-abstract counterparts (spec below)

**`@pyreon/<abstraction>-android`** (Kotlin):

- `build.gradle.kts` — Gradle module declaration
- `src/main/kotlin/<package>/` — Kotlin source
- `src/test/kotlin/<package>/` — JUnit / Kotest specs
- A `pyreon.json` manifest (same spec)

### Why three packages, not one

**Alternative considered: one package per abstraction with platform-conditional code via `if (typeof window === 'undefined') { ... }` or build-time substitution.**

Rejected because:

1. **Bundle bloat on every platform.** Swift code shipped in the same package as TypeScript means the npm tarball carries Swift sources nobody on web needs.
2. **No clean way to peer-depend on platform-specific deps.** `@pyreon/camera-ios` needs `AVFoundation`; `@pyreon/camera-android` needs `androidx.camera`. A single package would need to list both as peerDeps even though only one applies per platform.
3. **No clean way to version per-platform implementations independently.** iOS implementation might bump from 0.1 → 0.2 while Android stays at 0.1; same-package versioning conflates them.

Three packages is the same pattern React Native uses for its platform-split modules (`react-native-camera`, `react-native-camera-ios`, etc.). Battle-tested.

---

## The manifest format

Two manifest files per abstraction:

### 1. `PYREON_NATIVE_BINDINGS` in the abstract package's `package.json`

```jsonc
{
  "name": "@pyreon/storage",
  "version": "0.24.0",
  // ... existing fields ...
  "PYREON_NATIVE_BINDINGS": {
    "schemaVersion": 1,
    "bindings": [
      {
        "name": "useStorage",
        "kind": "hook",
        "signature": "<T>(key: string, defaultValue: T) => StorageSignal<T>",
        "platforms": {
          "web": { "impl": "./src/web.ts", "export": "useStorage" },
          "ios": {
            "package": "@pyreon/storage-ios",
            "module": "PyreonStorage",
            "symbol": "useStorage",
          },
          "android": {
            "package": "@pyreon/storage-android",
            "module": "io.pyreon.storage",
            "symbol": "useStorage",
          },
        },
        "typeContract": {
          "T": { "constraint": "Codable" },
        },
      },
      {
        "name": "useSessionStorage",
        "kind": "hook",
        "signature": "<T>(key: string, defaultValue: T) => StorageSignal<T>",
        "platforms": {
          "web": { "impl": "./src/web.ts", "export": "useSessionStorage" },
          "ios": {
            "package": "@pyreon/storage-ios",
            "module": "PyreonStorage",
            "symbol": "useSessionStorage",
          },
          "android": {
            "package": "@pyreon/storage-android",
            "module": "io.pyreon.storage",
            "symbol": "useSessionStorage",
          },
        },
        "typeContract": { "T": { "constraint": "Codable" } },
      },
      // ... more bindings ...
    ],
  },
}
```

**Fields**:

- `schemaVersion` — manifest schema version; bump only for breaking changes
- `bindings[]` — one entry per exported symbol the compiler should substitute
  - `name` — the JS export name
  - `kind` — `hook` (returns reactive state), `function` (one-shot call), `component` (JSX-renderable), `class` (constructor-based API)
  - `signature` — TypeScript signature (for doc/validation, not runtime use)
  - `platforms` — per-target binding info
    - `web` — `{ impl, export }` — relative path + JS export name; compiler uses this for web target
    - `ios` — `{ package, module, symbol }` — SPM package name + Swift module + symbol to call
    - `android` — `{ package, module, symbol }` — Maven coordinate + Kotlin package + symbol
  - `typeContract` (optional) — per-generic constraints the compiler enforces (e.g. `T: Codable` for storage)

**Why JSON manifest, not Pyreon-specific TS DSL**: tooling-agnostic. Other tools (lint rules, doc generators, IDE plugins) can read the manifest without parsing TS.

### 2. `pyreon.json` in each native package

```jsonc
// packages/native/abstractions/storage-ios/pyreon.json
{
  "schemaVersion": 1,
  "abstractPackage": "@pyreon/storage",
  "platform": "ios",
  "module": "PyreonStorage",
  "swiftPackagePath": "./",
  "minimumOSVersion": "17.0",
  "exports": [
    {
      "abstract": "useStorage",
      "symbol": "useStorage",
      "swiftSignature": "func useStorage<T: Codable>(key: String, defaultValue: T) -> StorageBinding<T>",
    },
    {
      "abstract": "useSessionStorage",
      "symbol": "useSessionStorage",
      "swiftSignature": "func useSessionStorage<T: Codable>(key: String, defaultValue: T) -> StorageBinding<T>",
    },
  ],
}
```

**Purpose**: declares what symbols this native package provides for which abstract package. Used by:

1. **The compiler's validation pass** — cross-checks that every abstract binding has a matching native export for the targeted platform.
2. **The `@pyreon/native-cli`** — uses this to know which SPM packages / Maven coordinates to add to the generated Xcode / Android Studio project.
3. **A future `pyreon doctor --check-native-bindings`** — surfaces missing or mismatched bindings as a CI gate.

---

## The compiler resolution algorithm

When the compiler emits a native target and encounters an import like `import { useStorage } from '@pyreon/storage'`:

1. **Load the abstract package's `package.json`** and check for `PYREON_NATIVE_BINDINGS`.
2. **If absent** — treat the import as pure-TypeScript, attempt normal type-mapper translation. (Most Pyreon packages — `@pyreon/reactivity`, `@pyreon/core` — fall here. They're platform-neutral; the type-mapper handles them.)
3. **If present** — for each used symbol from this import:
   a. Look up the binding in `PYREON_NATIVE_BINDINGS.bindings[]`.
   b. Get the platform-specific entry (`bindings[].platforms[<target>]`).
   c. If the entry is missing for the target, fail with: `[PMTC] @pyreon/storage exports useStorage but has no <target> implementation. Add a binding to PYREON_NATIVE_BINDINGS.bindings[].platforms.<target> in @pyreon/storage's package.json, OR remove the useStorage call from <file>.`
   d. Resolve the binding:
   - **iOS**: emit Swift `import <module>` at the top of the file. Translate the call site to use the native symbol. Add the SPM dependency to the generated Xcode project's `Package.swift`.
   - **Android**: same shape with Kotlin `import <package>.<module>.*` + Gradle dependency.
     e. Apply the `typeContract` constraints to the type-mapper for any generic parameters (e.g. `T: Codable` makes the type mapper emit `<T: Codable>` in the Swift signature and add `@Serializable` / `Codable` conformance to the user's type when needed).

4. **At the end of compilation**, write out the list of resolved native packages so `@pyreon/native-cli` can add them to the project file (Xcode `Package.swift` / Android `build.gradle.kts`).

### Pseudocode

```typescript
// In @pyreon/native-compiler
function resolveImport(
  importSpec: ImportSpecifier,
  usedSymbols: string[],
  target: 'ios' | 'android' | 'web',
): ResolvedImport {
  const abstractPkg = readPackageJson(importSpec.from)
  const manifest = abstractPkg.PYREON_NATIVE_BINDINGS

  // No manifest → fall through to type-mapper
  if (!manifest) {
    return { kind: 'typescript-passthrough', from: importSpec.from }
  }

  const bindings: ResolvedBinding[] = []
  for (const symbol of usedSymbols) {
    const entry = manifest.bindings.find((b) => b.name === symbol)
    if (!entry) {
      throw new PmtcError(
        `${importSpec.from} has PYREON_NATIVE_BINDINGS but no entry for "${symbol}". ` +
          `Add a binding or import a different name.`,
      )
    }

    const platformEntry = entry.platforms[target]
    if (!platformEntry) {
      throw new PmtcError(
        `${importSpec.from} exports "${symbol}" but has no ${target} implementation. ` +
          `Add a binding to PYREON_NATIVE_BINDINGS.bindings[].platforms.${target} ` +
          `in ${importSpec.from}'s package.json, OR remove the ${symbol} call.`,
      )
    }

    bindings.push({
      symbol,
      package: platformEntry.package,
      module: platformEntry.module,
      nativeSymbol: platformEntry.symbol,
      typeContract: entry.typeContract,
    })
  }

  return { kind: 'native-binding', bindings, target }
}
```

The validation pass and the emit pass both consume this resolution. Validation fails build; emit uses the resolved binding to produce native source.

---

## Walkthrough: `@pyreon/storage` end-to-end

Take the TodoMVC walkthrough's `useStorage<Todo[]>('pyreon-todomvc:todos', [])` call. Trace it through the resolution algorithm for each target.

### Web target

1. Compiler sees `import { useStorage } from '@pyreon/storage'`.
2. Reads `@pyreon/storage/package.json` → finds `PYREON_NATIVE_BINDINGS`.
3. Looks up `useStorage` → finds `platforms.web` = `{ impl: './src/web.ts', export: 'useStorage' }`.
4. Emits unchanged JS — the existing web implementation handles it.

No change from today. Web target is the "always works" baseline.

### iOS target

1. Compiler sees `import { useStorage } from '@pyreon/storage'`.
2. Reads manifest → finds `platforms.ios` = `{ package: '@pyreon/storage-ios', module: 'PyreonStorage', symbol: 'useStorage' }`.
3. Reads `@pyreon/storage-ios/pyreon.json` → confirms `PyreonStorage.useStorage` exists with signature `<T: Codable>(key:defaultValue:) -> StorageBinding<T>`.
4. Applies `typeContract.T.constraint = "Codable"` to the type mapper. The user's `Todo` type gets emitted with `Codable` conformance added automatically (or fails with a clear error if `Todo` contains a non-Codable field like a function).
5. Emits Swift:

   ```swift
   import PyreonStorage  // added at top of file

   struct TodoApp: View {
     @StateObject private var todos = PyreonStorage.useStorage(
       key: "pyreon-todomvc:todos",
       defaultValue: [Todo]()
     )
     // ...
   }
   ```

6. Adds `@pyreon/storage-ios` to the generated Xcode project's `Package.swift`:
   ```swift
   dependencies: [
     .package(path: "../../packages/native/abstractions/storage-ios"),
   ]
   ```

### Android target

1. Same as iOS but with Kotlin shape.
2. Emits:

   ```kotlin
   import io.pyreon.storage.useStorage

   @Composable
   fun TodoApp() {
     val todos = useStorage(key = "pyreon-todomvc:todos", default = listOf<Todo>())
     // ...
   }
   ```

3. Adds Maven coordinate to the generated Android module's `build.gradle.kts`:
   ```kotlin
   dependencies {
     implementation("io.pyreon:storage-android:0.1.0")
   }
   ```

### Missing-implementation case

If the user imports `useStorage` but `@pyreon/storage-ios` doesn't ship yet (Phase 1 in progress, iOS not built), the validation pass fails:

```
[PMTC] error in TodoApp.tsx:5
  @pyreon/storage exports useStorage but has no ios implementation.
  Add a binding to PYREON_NATIVE_BINDINGS.bindings[].platforms.ios in
  @pyreon/storage's package.json, OR remove the useStorage call from
  TodoApp.tsx.
```

The error names the file, the symbol, the missing platform, AND the two ways to fix it. Cannot silently emit broken Swift.

---

## The five reference abstractions

The PMTC plan (and the TodoMVC walkthrough) named these. This doc specifies their package shapes; the actual implementations are Phase 1+ work.

### 1. `@pyreon/storage`

| Field           | Value                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Abstract        | `useStorage<T>(key, default)` / `useSessionStorage<T>` / `useCookie<T>` / `useIndexedDB` / `useMemoryStorage`                                                                                                                                                                                                                                                                                                                |
| Web impl        | Existing `@pyreon/storage` package (localStorage / sessionStorage / cookies / IndexedDB / in-memory)                                                                                                                                                                                                                                                                                                                         |
| iOS binding     | `@AppStorage` (SwiftUI property wrapper) for primitive Codables; `UserDefaults` + JSONEncoder for arbitrary Codable types                                                                                                                                                                                                                                                                                                    |
| Android binding | DataStore (preferred) or SharedPreferences (fallback) + kotlinx-serialization                                                                                                                                                                                                                                                                                                                                                |
| Type constraint | `T: Codable` (Swift) / `@Serializable` (Kotlin)                                                                                                                                                                                                                                                                                                                                                                              |
| Notes           | The five existing storage backends (local / session / cookie / indexedDB / memory) likely don't all map cleanly to mobile. `useStorage` and `useSessionStorage` map fine (UserDefaults vs ephemeral). `useCookie` is HTTP-specific — emit a build-time warning for mobile targets and recommend `useStorage`. `useIndexedDB` maps to Core Data on iOS / Room on Android — significantly heavier; defer to a Phase 2 binding. |

### 2. `@pyreon/camera`

| Field           | Value                                                                                                                                                                                                                                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Abstract        | `useCamera({ facing })` returning `{ preview, capture, switch, permissions }`                                                                                                                                                                                                                                          |
| Web impl        | `getUserMedia()` + `<video>` element rendering the camera stream                                                                                                                                                                                                                                                       |
| iOS binding     | `AVCaptureSession` + `UIViewRepresentable`-wrapped `AVCaptureVideoPreviewLayer`                                                                                                                                                                                                                                        |
| Android binding | CameraX + `AndroidView`-wrapped `PreviewView`                                                                                                                                                                                                                                                                          |
| Type constraint | None                                                                                                                                                                                                                                                                                                                   |
| Notes           | First mobile-only-shaped abstraction (the web impl is "best effort" — most users won't ship the web camera). Permissions are async on all platforms; abstract should expose a `Promise<PermissionState>` for `requestPermission()` that maps to `AVCaptureDevice.requestAccess` / `ActivityCompat.requestPermissions`. |

### 3. `@pyreon/push`

| Field           | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Abstract        | `usePush({ onMessage, onToken })` + imperative `requestPermission()`                                                                                                                                                                                                                                                                                                                                                                                        |
| Web impl        | Web Push API + Service Worker for background                                                                                                                                                                                                                                                                                                                                                                                                                |
| iOS binding     | UNUserNotificationCenter + APNs registration; AppDelegate hook                                                                                                                                                                                                                                                                                                                                                                                              |
| Android binding | Firebase Cloud Messaging / WorkManager + NotificationManager                                                                                                                                                                                                                                                                                                                                                                                                |
| Type constraint | None                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Notes           | The hardest abstraction — every platform's push story is different at the lifecycle level (web Service Worker / iOS AppDelegate / Android Broadcast Receiver). The abstract API has to be the lowest-common-denominator: registration, onMessage callback, onToken callback. Anything platform-specific (rich notifications, action buttons, deep links from push) needs platform-specific extensions OR `<native:ios>` / `<native:android>` escape blocks. |

### 4. `@pyreon/biometrics`

| Field           | Value                                                                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Abstract        | `useBiometrics()` returning `{ authenticate, available, type }`                                                                                                                    |
| Web impl        | Web Authentication API (passkeys) — only works on supported browsers                                                                                                               |
| iOS binding     | LocalAuthentication framework (LAContext + LAPolicy)                                                                                                                               |
| Android binding | BiometricPrompt from androidx.biometric                                                                                                                                            |
| Type constraint | None                                                                                                                                                                               |
| Notes           | Web support is partial (Safari/Chrome passkeys); abstract should expose `available()` so user code can degrade gracefully. `authenticate()` returns `Promise<{ success, error }>`. |

### 5. `@pyreon/deep-links`

| Field           | Value                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| Abstract        | `useDeepLink((url) => void)` + imperative `handleLink(url)`                                                         |
| Web impl        | URL routing via `@pyreon/router` (already handled, no new package needed)                                           |
| iOS binding     | `.onOpenURL` SwiftUI modifier + Universal Links entitlement                                                         |
| Android binding | `Intent.ACTION_VIEW` + intent-filter in AndroidManifest                                                             |
| Type constraint | None                                                                                                                |
| Notes           | Pairs with `@pyreon/router` for navigation. The abstract is just the hook; navigation handling is the router's job. |

---

## Validation gates

Three CI gates the spec enables:

### Gate 1 — Manifest schema validation

`scripts/check-native-binding-manifests.ts`. Walks every `packages/**/package.json`, finds `PYREON_NATIVE_BINDINGS` fields, validates against the schema (correct fields, correct types, valid platform values, signature parses as TypeScript).

Failure: `[PMTC] @pyreon/<name> has malformed PYREON_NATIVE_BINDINGS at bindings[2].platforms.ios — missing required field "module".`

### Gate 2 — Cross-package binding consistency

`scripts/check-native-binding-consistency.ts`. For every abstract package's manifest, checks that for every binding:

- The native packages referenced exist
- The native packages' `pyreon.json` declares the matching symbol
- The Swift/Kotlin signature in the native manifest is consistent with the abstract signature

Failure: `[PMTC] @pyreon/storage declares useStorage with ios binding to @pyreon/storage-ios.PyreonStorage.useStorage, but @pyreon/storage-ios/pyreon.json does not export useStorage. Either add the export to @pyreon/storage-ios, or remove the binding from @pyreon/storage's manifest.`

### Gate 3 — User-code missing-binding detector

Part of the compiler — runs on every native-target build. If user code imports a manifest-declared binding but the target platform has no implementation, fails the build with the actionable error shown in the resolution walkthrough above.

These three gates collectively prevent every category of broken-binding bug **at CI time, not at runtime**.

---

## Where this lives in the package tree

```
packages/
  fundamentals/
    storage/                    — existing, gains PYREON_NATIVE_BINDINGS in package.json
  native/
    compiler/                   — existing (PR #794), extends to consume manifests
    cli/                        — Phase 0 PR 2 — uses manifests to wire SPM/Gradle deps
    runtime-swift/              — Phase 0 PR 1 — base runtime, eventually depended on by *-ios packages
    abstractions/
      storage-ios/              — Phase 1+
      storage-android/          — Phase 1+
      camera/                   — Phase 1+ (or Phase 2)
      camera-ios/               — Phase 1+
      camera-android/           — Phase 1+
      push/                     — Phase 2+
      push-ios/                 — Phase 2+
      push-android/             — Phase 2+
      biometrics/               — Phase 2+
      biometrics-ios/           — Phase 2+
      biometrics-android/       — Phase 2+
      deep-links/               — Phase 3+
      deep-links-ios/           — Phase 3+
      deep-links-android/       — Phase 3+
```

`packages/native/abstractions/` is the canonical location for native bindings. Web-first abstractions (`storage`, `deep-links`) keep their existing `packages/fundamentals/` location for the abstract package; only their native siblings go under `packages/native/abstractions/`.

---

## Sequencing recommendation

The spec doesn't require concrete implementations — but the compiler work to CONSUME the manifest must land before any abstraction is built.

| PR                               | Scope                                                | Phase                                                            |
| -------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- |
| Native-CI gate 1                 | `check-native-binding-manifests.ts` script           | Phase 0 (no actual manifests yet — script returns "0 found, ok") |
| Compiler manifest reader         | Read `PYREON_NATIVE_BINDINGS` from imported packages | Phase 0, after PR 5e                                             |
| Compiler binding resolver        | Apply the algorithm above; emit per-platform         | Phase 0, after manifest reader                                   |
| Compiler missing-impl gate       | Error message + actionable fix per the walkthrough   | Phase 0, with binding resolver                                   |
| Native-CI gate 2                 | Cross-package consistency checker                    | Phase 1, once first abstraction ships                            |
| `@pyreon/storage` manifest       | Add `PYREON_NATIVE_BINDINGS` to existing package     | Phase 1                                                          |
| `@pyreon/storage-ios`            | First reference implementation                       | Phase 1                                                          |
| `@pyreon/storage-android`        | First reference implementation                       | Phase 1                                                          |
| `@pyreon/camera` + ios + android | Second abstraction (uses storage as the precedent)   | Phase 2                                                          |
| Remaining abstractions           | One per quarter                                      | Phase 2 → Phase 4                                                |

**Critical insight**: the compiler manifest-reader work (Phase 0) must land BEFORE the first abstraction ships (Phase 1). Otherwise the first abstraction package will accumulate compiler special-cases instead of being a generic consumer of the manifest mechanism.

---

## What this doc commits to

- **Three-package split** per abstraction (`@pyreon/X` + `X-ios` + `X-android`).
- **`PYREON_NATIVE_BINDINGS` manifest** in abstract packages declares the bindings.
- **`pyreon.json`** in native packages declares the exports.
- **Compiler resolution algorithm** is manifest-driven, not per-package hardcoded.
- **Three CI gates** prevent broken-binding bugs (manifest schema / cross-package consistency / user-code missing-impl).
- **`packages/native/abstractions/`** is the canonical location for native bindings.
- **Compiler manifest-reader work lands in Phase 0** before any abstraction ships in Phase 1.

## What this doc does NOT commit to

- **Which platform's idiom wins when they conflict** (e.g. iOS `@AppStorage` is more compact than Android's DataStore). Each abstraction handles this per-case in its own native binding.
- **How to version platform packages relative to the abstract package.** Recommendation: independent semver per native package; the abstract package's manifest pins a compatible-range per binding (e.g. `"package": "@pyreon/storage-ios@^0.1"`). Spec is left open until the first abstraction tests it.
- **How `<native:ios>` / `<native:android>` escape blocks interact with the manifest mechanism.** The PMTC plan says these are for truly unique-to-one-platform edge cases. Recommendation: they bypass the manifest entirely — pure passthrough to the native target. Spec'd in a follow-up if Phase 1 hits a real use case.
- **Tree-shaking guarantees.** If the user imports `useStorage` but not `useIndexedDB`, the iOS build shouldn't link the indexedDB native code. Modern SPM / Gradle handle this if the native packages are organized correctly (one Swift module per binding-group). Spec'd as a "recommendation," not a hard requirement.

The next concrete deliverable after this spec is the **Phase 0 compiler manifest-reader work** — a new PR that extends the existing compiler skeleton (PR #794) to read `PYREON_NATIVE_BINDINGS` from imported packages and resolve bindings per target. That PR is small enough to fit between Phase 0's PR 5e (async type mapper) and Phase 1's first abstraction work.
