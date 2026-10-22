---
title: Pyreon vs Expo, React Native, Flutter, KMP and Capacitor
description: An honest comparison for teams choosing how to build an app for web, iOS and Android — what Pyreon does differently, where it is behind, and when you should pick something else.
---

This page is deliberately honest, including about where Pyreon loses. It compares **approaches**, not marketing claims. Facts about other frameworks are taken from their own 2026 documentation and release notes and are summarized as of October 2026; they change quickly, so check the linked sources before you decide.

**Read this first:** Pyreon's native targets (iOS and Android, via the [PMTC compiler](/docs/multiplatform)) are **experimental**. About 70% of the weighted capability matrix is proven to behave on a real simulator or emulator — the gated number lives at the bottom of the [Multi-Platform page](/docs/multiplatform). The web side (SSR, SSG, islands, SPA) is the mature part. If you must ship a store app next quarter with a large third-party SDK footprint, the table below will tell you to pick Expo or Flutter, and that is the right call.

## The one-paragraph difference

Expo, React Native, Flutter, Kotlin Multiplatform and Capacitor all start from a **mobile runtime** and add web later. Pyreon starts from a **web framework with fine-grained signals** and compiles the same component source to **SwiftUI and Jetpack Compose** — no JavaScript engine and no virtual machine on the device. That shape gives it two structural advantages (real native UI without a JS runtime; real web with SSR and SEO from the same source) and one structural cost (code that is compiled ahead of time cannot be replaced over the air, and only a deliberately narrow subset of TypeScript compiles to native).

## Comparison

| | **Pyreon** | **Expo / React Native** | **Flutter** | **Kotlin / Compose Multiplatform** | **Capacitor / Tauri** |
| --- | --- | --- | --- | --- | --- |
| **Language** | TypeScript (a declarative subset on native) | TypeScript / JavaScript | Dart | Kotlin | Web stack |
| **UI on device** | Generated SwiftUI / Compose — platform-native widgets | React Native renders platform widgets; Expo UI adds SwiftUI / Compose components | Draws its own pixels (Impeller) | Compose everywhere (iOS looks like Compose, not UIKit) | A WebView |
| **JS / VM runtime on device** | None (native binary) | Hermes JS engine | Dart runtime (AOT) | Kotlin/Native | WebView engine |
| **Web** | First-class: SSR, SSG, ISR, islands, SPA | react-native-web / Expo Router web; SSR is newer and still maturing | Canvas/Wasm rendering — weaker SEO and link previews | Compose for Web, less mature | It *is* web |
| **Native-module story** | `useNativeModule` calls app-provided Swift/Kotlin; packages can ship `native/` sources that the toolchain scans | Expo Modules API, TurboModules; very large library catalog | Platform channels, FFI, pub.dev | `expect`/`actual`; klibs.io catalog | Plugins |
| **Over-the-air code updates** | **Not possible** for native logic (it is compiled). Data-driven config and WebView islands are the workarounds | EAS Update | Third-party (Shorebird) | None | Third-party |
| **Build / submit pipeline** | Local `xcodebuild` / `gradle`; no hosted build or submit service | EAS Build / Submit / Workflows | Codemagic and others | Gradle / Xcode | Varies |
| **Hot reload on device** | Web: yes. Native: rebuild per change | Fast Refresh | Stateful hot reload | Rebuild per change on iOS | Vite HMR |
| **Third-party native SDKs** | Few first-party bindings; you write a `useNativeModule` bridge for the rest | Largest catalog (Expo SDK + community) | Large (pub.dev, FlutterFire) | Growing | Plugin ecosystem |
| **Animation** | Platform animation via `<Transition>`; no Reanimated/Skia equivalent | Reanimated, Skia | Best-in-class | Compose animation | CSS |
| **Maturity of native targets** | **Experimental** | Production | Production | iOS stable since Compose Multiplatform 1.8 | Production (WebView) |

## Where Pyreon is structurally different

1. **No JavaScript runtime on the device.** The generated app is SwiftUI or Compose code. There is no engine to boot, no bridge, and no New-Architecture compatibility matrix to keep green. Whether that makes your app faster or smaller needs a measurement on *your* app; we do not publish a number for it.
2. **OS redesigns arrive for free.** A generated SwiftUI `Toggle` *is* the platform toggle, so a new OS design language reaches your app without a framework release. Frameworks that draw their own widgets have to re-imitate each redesign.
3. **Real web from the same source.** The same components server-render, hydrate and index like any other web page — no canvas rendering and no separate web codebase. Of the mobile-first frameworks above, this is the combination the others do not offer in production today.
4. **Signals map directly onto the platforms.** Fine-grained signals line up with SwiftUI's `@Observable` and Compose's `State`: there is no re-render model to learn or work around.
5. **Errors name the fix.** Code outside the compilable subset produces a *named* warning, not a silent miscompile, which also makes the compiler a useful feedback loop for AI coding agents. The framework ships an MCP server and `llms.txt` for the same reason.

## Where Pyreon is behind

- **Over-the-air updates.** Expo's EAS Update lets a team push JavaScript fixes without a store review. Compiled native code cannot be replaced that way under store rules. If your release process depends on shipping logic changes between store reviews, this is a real reason not to choose Pyreon's native targets.
- **Third-party native SDKs.** Payments, analytics, maps, camera and push SDKs are published for React Native, Flutter and Kotlin. Pyreon has first-party hooks for common cases (see the [capability matrix](/docs/multiplatform) for which are device-proven) and the `useNativeModule` bridge for the rest, but you will write more glue than on Expo.
- **The compilable subset.** Native targets compile a deliberately narrow, declarative subset of TypeScript. Code outside it warns by name and does not run on the device — whereas React Native and Flutter run their whole language everywhere.
- **No hosted build, submit or CI service.** Expo's EAS covers build, submit, update and monitoring as a product. Pyreon gives you the compiler and the scaffolds; the pipeline is yours.
- **Dev loop on native.** There is no hot reload of generated native UI; a change means a rebuild. Web development is the fast loop.
- **Animation, desktop and community.** Reanimated / Skia and Flutter are well ahead on animation; Flutter and Tauri are ahead on desktop; the React Native and Flutter communities, job markets and library catalogs are much larger.

## When to pick something else

- You need **OTA code updates** as a core release practice → **Expo**.
- Your app is **graphics-heavy or animation-led** and must look identical on every platform → **Flutter** (or React Native with Skia).
- You have a **large existing Kotlin codebase** and Android-first teams → **Kotlin Multiplatform**.
- You have an existing web app and want a **thin store wrapper** → **Capacitor**.
- You depend on a **large set of third-party native SDKs** with no time to write bridges → **Expo / React Native**.

## When Pyreon fits

- **Web is a first-class product** (SEO, SSR, link previews) *and* you want native iOS/Android apps from the same components.
- You want **truly native UI** on both platforms without a JavaScript runtime, and your screens are mostly forms, lists, navigation and data — the declarative core the compiler handles best.
- You like **TypeScript and fine-grained reactivity** and want to avoid re-render tuning.
- You are comfortable adopting a framework whose native side is **experimental** and are willing to track the device-proven matrix as it moves.

## Sources

Verify any competitor claim against its own current documentation: [Expo SDK changelog](https://expo.dev/changelog), [Expo UI](https://docs.expo.dev/versions/latest/sdk/ui/), [React Native blog](https://reactnative.dev/blog), [Flutter roadmap](https://flutter.dev/blog), [Compose Multiplatform releases](https://blog.jetbrains.com/kotlin/), [Capacitor docs](https://capacitorjs.com/docs) and [Tauri docs](https://tauri.app).

See also: [Why Pyreon](/docs/why-pyreon), [Multi-Platform (PMTC)](/docs/multiplatform), [PMTC Library Status & Authoring](/docs/multiplatform-libraries), [Coming from React Native & Expo](/docs/migrating-from-react-native).
