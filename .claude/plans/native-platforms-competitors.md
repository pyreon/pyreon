# PMTC competitor survey — what beats it, where, and why anyone would pick PMTC anyway

**Status**: Companion to [`native-platforms.md`](./native-platforms.md) (PMTC strategic direction, merged in #764). Honest competitive landscape — not a marketing doc. If a competitor beats PMTC on an axis, this names it.

**Scope**: as-of late 2025 / early 2026. Multiplatform UI is moving fast (Compose MP iOS stable May 2025, RN 0.79 with bridgeless default March 2025, Lynx open-sourced March 2025, Tauri 2.0 mobile October 2024) — treat this doc as a snapshot, re-survey before any major Phase commitment.

---

## TL;DR

PMTC targets a quadrant **no shipping framework occupies today**: real native widgets (SwiftUI on iOS, Compose on Android) + no JS engine on device + DOM target for web + single TSX source. The closest analog is **Skip** (real SwiftUI source → real Compose, no engine), but Skip uses Swift not TSX and has no web target. Every other comparison either ships a JS engine, draws to a canvas, or hosts a WebView.

**The strategic risk is not "we lose to a better PMTC."** No framework is shipping a PMTC-shaped product today. The risks are:

1. **Time-to-market**: PMTC is ~2-3 years to production-ready; Compose Multiplatform (1.8 stable on iOS May 2025) and React Native (0.79 New Architecture default) ship NOW. Teams pick what ships.
2. **Compose Multiplatform's strategic positioning**: JetBrains is the biggest backer with the longest head start. Their iOS story is Skia-rendered (NOT native widgets), which is PMTC's core differentiator — but CMP's iOS app still "works" today, and "Skia draws iOS widgets" is invisible to most users.
3. **Skip's market overlap**: tightest direct competitor on the "real platform widgets" axis. Skip's iOS-first audience won't pick PMTC. PMTC's web-first audience won't pick Skip. The split is whether the market for "I want web AND real-native mobile from one source" is big enough.
4. **React Native + Expo with Fabric+Bridgeless+New Architecture is closer to "native" than the framework's reputation suggests**. 4M weekly npm downloads, Meta-recommended Expo, real production widgets via Fabric. The gap PMTC widens vs RN is "no JS engine in the binary" — real but increasingly subtle.

**PMTC's defensible niche**: teams writing Pyreon for web who want to add native mobile without (a) accepting WebView shells, (b) accepting Skia/Impeller's not-real-widgets compromise, (c) writing a separate React Native codebase, OR (d) shipping a JS engine on device. That's a narrow but real audience. The bet is whether it's large enough to justify 2-3 years of compiler investment.

---

## The matrix

The four-axis comparison that frames every other discussion in this doc:

| Framework             | Real native widgets?               | Engine on device?    | Web target?           | Source language |
| --------------------- | ---------------------------------- | -------------------- | --------------------- | --------------- |
| **PMTC (claimed)**    | **Yes (real SwiftUI + Compose)**   | **No**               | **Yes (DOM)**         | TSX dialect     |
| Skip                  | **Yes (real Compose)**             | No                   | No                    | Swift           |
| Compose Multiplatform | No (Skia on iOS)                   | No (Kotlin/Native)   | Yes (JS/WASM)         | Kotlin          |
| React Native (0.78+)  | Yes (Fabric → UIKit/View)          | **Yes (Hermes)**     | Limited (RN Web)      | React TSX       |
| Expo (= RN+toolchain) | (= RN)                             | (= RN)               | (= RN Web)            | React TSX       |
| NativeScript-Vue      | Yes (UIKit/Android View)           | **Yes (V8/JSC)**     | No                    | Vue 3           |
| Lynx                  | Yes (custom tree → platform views) | **Yes (PrimJS)**     | Limited               | TSX (ReactLynx) |
| Flutter               | **No (Impeller draws)**            | No (Dart AOT)        | Yes (WebGPU port WIP) | Dart            |
| Capacitor             | **No (WebView)**                   | **Yes (in WebView)** | Yes (IS web)          | Any web         |
| Tauri 2.0 (mobile)    | **No (WebView)**                   | **Yes (in WebView)** | Yes                   | Any web + Rust  |
| Solid Native          | (= RN)                             | (= RN)               | No                    | TSX + Solid     |

**Bold cells are PMTC's three distinguishing claims**: real native widgets, no engine on device, web target included. **Exactly one row matches all three: PMTC.** Skip matches the first two but not web. CMP matches "no engine" and "web" but not "real widgets on iOS." Everything else trades at least two of the three.

The honest read: the quadrant is unoccupied not because nobody thought of it, but because it's expensive — compile-to-source AND a separate emitter per platform AND keep the web path working AND map a JS-shaped reactive model onto Swift's `@State` and Kotlin's `MutableState`. PMTC's bet is the engineering investment is worth the strategic position.

---

## Per-competitor deep dives

Each section structured: **what they win**, **where they fall short of PMTC's pitch**, **why a user would pick PMTC instead** (or: name the case where they wouldn't).

### 1. Skip — the tightest direct competitor on "real widgets"

**Architecture**: Swift Package Manager build plugin. Two modes — **Skip Lite** transpiles Swift+SwiftUI to Kotlin+Compose at build time; **Skip Fuse** compiles Swift natively for Android using the official Swift SDK for Android. Either way, the Android app runs real Jetpack Compose widgets (Material 3). The iOS app is the unmodified Swift build. Source-level translation, no engine on device.

**What they win**:

- **Truly native on both platforms**. Skip's SkipUI library maps `SwiftUI.Divider` → `androidx.compose.material3.Divider`. The widgets on Android are real Compose primitives, not drawn pixels. Same axis PMTC claims, achieved today.
- **iOS path is literally unchanged**. iOS builds are a normal Xcode build; Skip only adds the Android emission step. Zero risk to iOS DX.
- **Shipping today**. 2,200+ Swift packages now build for Android via Skip. Production apps exist (mostly indie/small shops).
- **No new language for iOS devs**. Swift devs write Swift. No JSX dialect learning curve.
- **Pure source-level**. No runtime engine, no bridge, no compromises in the iOS output.

**Where they fall short of PMTC's pitch**:

- **No web target**. Skip is iOS-first; web isn't in their plan. PMTC's pitch is "same source, web AND mobile" — Skip cannot serve the web side at all.
- **Source language is Swift**. A web team using Pyreon today writes TSX. Skip would require rewriting in Swift. Zero migration path for web-first teams.
- **SwiftUI subset, not full Swift**. SkipUI's coverage of SwiftUI is partial — large percentage but not complete. New SwiftUI features land in Skip with lag.
- **Backed by an indie team (Marc Prud'hommeaux + Abe White)** — no JetBrains-scale resourcing. Risk of stalling if the maintainers move on.
- **Debug story splits across Swift and Kotlin** when Skip Lite transpiles — breakpoints can hop between source languages.

**Why a user picks PMTC instead**: their existing codebase is web (Pyreon) and they want to add iOS+Android without abandoning the web app or rewriting in Swift. Skip can't help — its source-of-truth is Swift, and there's no story for web. PMTC's source-of-truth is TSX, and web is already shipping.

**Why a user picks Skip instead**: their existing codebase is iOS (Swift+SwiftUI) and they want Android parity without the web concern. PMTC requires them to throw away their Swift codebase and rewrite in TSX — zero starter. Skip drops in alongside their existing Xcode build with no rewrite.

**Honest assessment**: Skip is the framework most likely to make PMTC strategically redundant for some audiences. The split is the source language. If you imagine the audience as a 2x2 grid (web-source vs native-source × wants-web vs only-mobile), Skip owns the "native-source, only-mobile" quadrant and PMTC owns the "web-source, wants-web-and-mobile" quadrant. Different products. They don't compete head-to-head.

### 2. Compose Multiplatform (JetBrains) — biggest backer, longest head start, weakest "truly native" claim

**Architecture**: Kotlin/Native compiles the Compose runtime + your composables to a native binary. On iOS, the entire UI is drawn into a single `ComposeUIViewController` via Skia/Skiko — NOT into UIKit views. On Android the same code uses real Compose primitives. JS/WASM target also exists for web (Skia-rendered).

**What they win**:

- **JetBrains-scale backing**. Kotlin's parent company funds CMP development directly. Multi-year sustained investment is guaranteed in a way no indie framework can promise.
- **iOS stable as of 1.8.0 (May 2025)**. Production-ready today. PMTC won't ship anything Phase-1-equivalent for ~1 year minimum.
- **Production usage at scale**. Respawn (96% shared), Wrike, Physics Wallah (17M MAU), BiliBili IM. Real apps shipping with real users.
- **First-class JetBrains tooling**. Android Studio + IntelliJ both native to Kotlin. Debug story is mature.
- **Compose itself is the dominant Android UI framework now** — picking CMP doesn't fork the Android team off the platform default; they get to use the same APIs they'd use for Android-only.

**Where they fall short of PMTC's pitch**:

- **iOS UI is Skia-rendered, NOT UIKit widgets**. This is the central PMTC vs CMP axis. CMP renders Compose into a single iOS surface; the user touches a `ComposeUIViewController`, not UIKit views. Platform-native scrolling physics, gestures, accessibility — all must be re-implemented in Compose rather than inherited from UIKit.
- **Source language is Kotlin**. A web team using Pyreon today writes TSX. CMP would require rewriting in Kotlin. Same problem as Skip's Swift requirement.
- **iOS-platform accessibility is a known weakness** vs real UIKit. Compose's accessibility model maps imperfectly to iOS's VoiceOver expectations. JetBrains is working on it (1.10.x improvements to `UIKitInteropProperties`), but it's behind native.
- **Binary size penalty** from bundling Skia + Kotlin/Native runtime. Smaller penalty than React Native's Hermes (Kotlin/Native ahead-of-time compiles, no engine), but still a few MB.
- **No SwiftUI source-level output**. Always Skia-rendered on iOS. There is no "emit native SwiftUI source" mode — that's a deliberate design choice (the whole point is "Compose everywhere"). PMTC's pitch (real SwiftUI code on iOS) is structurally outside CMP's scope.
- **Cupertino theming is community-driven**, not first-party. Apps that look "native iOS" via CMP require extra effort to match platform conventions.

**Why a user picks PMTC instead**: they care that the iOS app uses REAL UIKit/SwiftUI views (not drawn pixels imitating them). They want accessibility to match the platform exactly. They want their existing web Pyreon app to extend to mobile without learning Kotlin. They want SwiftUI engineers to read the iOS output and recognize it as SwiftUI.

**Why a user picks CMP instead**: they're a Kotlin-first shop with an existing Android app. CMP lets them ship iOS quickly with code reuse from Android. The Skia rendering is invisible to most users (their apps don't ship until 1-2 years after CMP iOS stable, by which time the rough edges are polished). Mature backing (JetBrains) beats indie risk (PMTC ~2-3 years out).

**Honest assessment**: CMP is the highest-profile multiplatform framework that's structurally closest to PMTC in scope (same code, multiple platforms, no JS engine, web target). The fundamental disagreement is "what does 'native' mean": for CMP, native means "compiles ahead-of-time, no JS engine, fast performance." For PMTC, native means "real platform widgets, not drawn pixels." Users for whom "real widgets" matters less than "ship in 2025" will pick CMP. PMTC has to convince them otherwise — that's marketing work, and it's hard work, because CMP's user-visible quality is high.

### 3. React Native (0.78+ with New Architecture) — closer to "native" than its reputation suggests

**Architecture**: Hermes JS engine on device + React (TSX/JSX) + Fabric renderer (C++ shared renderer producing real UIKit/Android Views) + TurboModules (native modules via JSI) + Bridgeless Mode (the legacy JSON bridge is gone). React 19 supported as of 0.78 (Feb 2025). New Architecture is the default starting with 0.79.

**What they win**:

- **Production-dominant**. 4M weekly npm downloads. Meta (Facebook, Instagram, Ads Manager, Messenger Desktop), Shopify (86% shared code), Discord (98% shared), Microsoft Office, Walmart, Coinbase, Bloomberg, Tesla, Pinterest, Uber Eats, Wix, Salesforce. The volume leader by a wide margin.
- **Real native widgets via Fabric**. Not canvas, not WebView — Fabric produces actual UIKit views on iOS and Android Views on Android. The widget-level "native" claim is true.
- **Massive ecosystem**. Every native module you can imagine has an RN binding. Camera, push, biometrics, payments, deep links — solved. PMTC has to build all of these from scratch as part of its 2-3-year window.
- **Meta is now officially recommending Expo as the default RN framework** (quote from Nicola Corti, Meta: _"the only recommended community framework for React Native is Expo"_). One blessed path, mature toolchain.
- **OTA updates via EAS Update / CodePush**. Bug fixes ship in hours without App Store review. PMTC explicitly gives this up (no JS engine = no dynamic code) — a real loss for some teams.
- **React 19 features land first**: `useActionState`, `useOptimistic`, `use`, Actions, ref-as-prop. The React ecosystem keeps evolving and RN follows close behind.

**Where they fall short of PMTC's pitch**:

- **JS engine on device**. Hermes still ships in the binary. ~5-10 MB cost. The runtime cost (memory, battery during heavy JS work) is real, even with Hermes's ahead-of-time bytecode compilation.
- **Native output is NOT human-readable Swift/Kotlin**. The C++ Fabric layer produces native views at runtime via reflection — there is no "here's the SwiftUI code your component compiled to" inspection. PMTC's pitch ("Swift devs can read the output and recognize it as SwiftUI") is structurally impossible with RN.
- **StyleSheet is not CSS**. RN's styling is a constrained subset (no cascade, JS object syntax, Yoga for layout). PMTC's claim of "same styler / unistyle / rocketstyle across platforms" is a step up from RN's "RN-only stylesheet, write platform-specific overrides for divergent styling."
- **The JS thread can still drop frames** on heavy computation. Bridgeless mode reduces but doesn't eliminate this. PMTC's compiled-ahead-of-time output has no JS thread at all.
- **Brownfield iOS integration historically painful** — 0.78 improves with `RCTReactNativeFactory`, but adding RN to an existing iOS app is still nontrivial. PMTC's compile-to-Swift output could integrate as a Swift Package directly.
- **No web story** in the official RN — `react-native-web` exists but is a separate community project with its own constraints. PMTC's web target is the same source, first-class.

**Why a user picks PMTC instead**: they care about binary size (no JS engine = -10-20 MB), inspectable output (Swift/Kotlin source that platform engineers can read), perf parity with hand-written native (no JS bridge ever), and integrating into existing native projects as Swift Packages / Maven artifacts. They DON'T need OTA updates. They already write web in TSX with signals (Pyreon) and don't want to maintain a parallel React codebase for mobile.

**Why a user picks RN+Expo instead**: their existing codebase is React (web or mobile). They need a mature ecosystem with every native binding already solved. They need OTA updates for fast bug-fix cycles. They have a brownfield existing iOS/Android app and want to add a few features without rewriting. They want to ship in 2026, not 2028.

**Honest assessment**: RN+Expo is the volume incumbent and Meta's official recommendation. PMTC is not competing for RN's audience head-on — that audience is huge, satisfied with Fabric's "near-native," and ecosystem-locked. PMTC's audience is the **subset of web teams who picked Pyreon specifically because they wanted signals not React** AND want native mobile AND care about the "real platform widgets / no engine / readable output" properties. That's narrower than RN's audience by orders of magnitude. The question is whether it's wide enough to justify the build.

### 4. Flutter — the cautionary tale for "draws its own widgets"

**Architecture**: Dart AOT-compiled to native ARM binary, with the Impeller rendering engine (Metal on iOS, Vulkan on Android API 29+) drawing all UI onto a single platform surface. Widgets are Flutter's own — `Cupertino*` widgets _imitate_ UIKit; they are not UIKit views.

**What they win**:

- **Mature, massive ecosystem**. ByteDance, Alibaba, BMW, Google Pay, eBay Motors, broad enterprise adoption.
- **Single codebase truly works**. iOS, Android, web (via WebGPU port WIP), desktop, embedded — Flutter ships everywhere.
- **Performance is excellent**. Impeller delivers ~50% frame rasterization improvements in 3.27 (Dec 2024). Dart AOT means no JIT churn.
- **Hot reload is best-in-class** — sub-second feedback for most edits. PMTC's hot reload will be a Phase-3 concern at best.
- **No JS engine, no bridge** — Dart compiles ahead-of-time. Same property PMTC claims, achieved years ago.

**Where they fall short of PMTC's pitch**:

- **Not native widgets — period**. This is the deepest structural difference. A Flutter `CupertinoButton` is Flutter's drawing of what UIKit's button looks like. The user is interacting with pixels, not a `UIButton`. PMTC's pitch ("structurally indistinguishable from hand-written SwiftUI") is the explicit opposite.
- **Cupertino widgets lag real iOS by 1-2 OS releases**. When Apple ships a new UIKit visual treatment, Flutter has to manually re-implement it. The lag is permanent — Flutter can never catch up because it's reimplementing, not inheriting.
- **Accessibility behavior diverges from platform expectations**. Flutter's accessibility tree is bridged to OS accessibility APIs, but the mapping is imperfect. Real UIKit views inherit accessibility for free; Flutter has to fake it.
- **Text selection menus, scroll physics, gesture recognizers** — all subtle UX details that real platform views handle correctly out of the box. Flutter has to re-implement each, and the implementations always feel slightly off to platform natives.
- **Source language is Dart**. Web teams using TSX or any JS framework have zero migration path to Dart. Dart is not transferable to non-Flutter use cases.

**Why a user picks PMTC instead**: they care that the iOS app uses real UIKit accessibility, real iOS scroll physics, real text selection. They want SwiftUI engineers to drop in and recognize the code. They want Apple's WWDC announcements about new UIKit features to land for free, not require Flutter team re-implementation. They write web in TSX, not Dart.

**Why a user picks Flutter instead**: they want one codebase across iOS+Android+web+desktop AND they don't care that the iOS app isn't "real" UIKit — pixel-imitation is good enough for their UX bar. The mature ecosystem and the hot reload are decisive.

**Honest assessment**: Flutter is the existence proof for "draw your own widgets" as a viable strategy. Flutter is wildly successful despite the "not native widgets" criticism. This suggests PMTC's "real widgets" differentiator is **valued by a smaller market than PMTC's framing assumes**. Most users don't care whether their button is a `UIButton` or a pixel that looks like one. Power users do; design-conscious teams do; accessibility-conscious teams do — but the volume audience doesn't. PMTC's pitch should be calibrated to "this matters for accessibility, design-system fidelity, and platform-native feel" — not "this matters universally."

### 5. Capacitor (Ionic team) — the WebView shell PMTC explicitly disqualified

**Architecture**: Web app runs inside a system WebView (WKWebView iOS, Android WebView Android) with a native-bridge plugin system marshaling JSON to Swift/Kotlin code for platform APIs.

**What they win**:

- **Trivial migration from web**. Your existing React/Vue/Solid/whatever web app drops in as-is. No rewrite.
- **Ship in days, not years**. PMTC is ~2-3 years. Capacitor is a weekend project.
- **Mature**: years in production, Burger King app, Tim Hortons, Sworkit. Real shipping apps.
- **Plugin ecosystem is mature** — Cordova plugins compatible, plus modern Capacitor plugins for every common native API.

**Where they fall short of PMTC's pitch**:

- **Not native widgets**. UI is HTML/CSS in a WebView. Everything PMTC says about "structurally indistinguishable from hand-written SwiftUI" is the opposite of Capacitor.
- **WebView performance ceiling** = system WebView's ceiling. Complex gestures, scroll physics, animations — all worse than native.
- **Bridge overhead** for every native API call. JSON serialization between JS and native code. Adds up at high traffic.
- **Native UI parity requires a plugin per feature**. Want a native modal sheet? Need a plugin. Native action sheet? Plugin. Native tab bar? Plugin.

**Why a user picks PMTC instead**: they want the app to feel native, perform native, look native, behave native — all things WebViews compromise on. They're willing to pay the 2-3 year engineering cost to get it.

**Why a user picks Capacitor instead**: they have a web app today and need a mobile app this quarter. The UX compromises are acceptable. Native-feel isn't the priority — shipping is.

**Honest assessment**: PMTC and Capacitor serve opposite ends of the spectrum. PMTC is for teams who reject WebView-shell as a UX compromise. Capacitor is for teams who reject 2-3 years of waiting. They don't compete. Listing Capacitor in this survey is calibration: "if you're considering PMTC, here's the lightweight option, and here's why you'd reject it."

### 6. Tauri 2.0 (mobile) — Rust core + WebView, mobile-as-second-class

**Architecture**: Rust core + system WebView (WKWebView iOS/macOS, WebView2 Windows, WebKitGTK Linux, Android System WebView) with Rust-driven IPC and Swift/Kotlin plugin authoring for mobile-specific APIs.

**What they win**:

- **Rust core gives better perf than pure-JS shells** for compute-heavy work.
- **Smaller binary than Electron** by using the system WebView (no bundled Chromium).
- **Tauri 2.0 (October 2024) added mobile support officially**. iOS + Android targets exist today.

**Where they fall short of PMTC's pitch**:

- **WebView UI**. Same problem as Capacitor — not native widgets, not native performance.
- **Mobile is explicitly second-class** in the Tauri team's own framing. The 2.0 launch blog said "not the 'mobile as a first-class citizen' release."
- **Mobile plugin ecosystem is small** vs Capacitor's mature plugin directory.
- **No menu/system-tray/global-shortcut on mobile** (architectural — many `tauri-runtime` traits don't apply).
- **Android WebView version depends on user's device-installed Chrome** — fragmentation issue PMTC sidesteps entirely (native widgets don't have version skew).

**Why a user picks PMTC instead**: they want truly native, not WebView. They want a polished mobile-first DX, not "we ship mobile but desktop is our priority."

**Why a user picks Tauri instead**: they're building a desktop-first app with mobile as a bonus. Their team already knows Rust. They want Tauri's deep system integration on desktop.

**Honest assessment**: Tauri is desktop-focused with mobile as a follow-on. PMTC is mobile-and-web focused. Different markets. Not a meaningful competitor for PMTC's positioning.

### 7. Lynx (ByteDance) — the newest entrant, multi-renderer architecture

**Architecture**: Custom dual-threaded native runtime — **PrimJS engine** (QuickJS-derived) + a separate "main thread" rendering pipeline producing a native UI tree. **ReactLynx** is the default JS framework; Vue/Svelte community ports exist. CSS for styles (real CSS, not RN StyleSheet).

**What they win**:

- **Real CSS support**. Selectors, variables, animations, transitions, gradients, masks. A real differentiator vs RN's constrained StyleSheet. PMTC's `@pyreon/styler` story is closer to Lynx's than to RN's.
- **TikTok-class production usage**. Shipping inside TikTok's Search panel and TikTok Studio (the creator app). Real production scale (TikTok is one of the largest mobile apps on Earth).
- **Native widget tree, not canvas**. Lynx produces native iOS/Android views (not Skia-drawn pixels).
- **Multi-framework neutrality**. Not tied to React — Vue and Svelte ports exist (community-built).
- **Open-sourced March 2025**, actively developed by ByteDance.

**Where they fall short of PMTC's pitch**:

- **PrimJS engine ships on device** — JS engine cost (memory, binary size, battery during hot paths). PMTC explicitly avoids this.
- **Cannot scaffold a brand-new standalone app**. Lynx must be **embedded into an existing native host app**. PMTC apps can be standalone Xcode projects / Android Studio projects.
- **No web target yet** (limited/early-stage). PMTC's web is first-class.
- **Ecosystem is nascent** vs RN's 8+ years of community.
- **PrimJS is QuickJS-class** — ES2019 only. Modern JS features (top-level await, decorators, etc.) may not work.
- **iOS-developer migration story is weak** — Swift devs don't write Lynx; Lynx is a JS framework that produces native views.

**Why a user picks PMTC instead**: they want zero JS engine in the binary. They want standalone projects, not host-app embedding. They want the web path to be a first-class equal target, not a future-work item. They write web in TSX with signals, not React.

**Why a user picks Lynx instead**: they're already inside ByteDance's tech stack or want to follow it. They need to ship inside an existing native host app (Lynx is built for this). They're comfortable with a JS engine on device.

**Honest assessment**: Lynx is interesting because it shares PMTC's "real CSS" property and avoids the WebView trap. But it ships a JS engine and is host-app-embedded — both of which PMTC explicitly rejects. They overlap on the "real widgets + real CSS" axis but diverge on the runtime architecture. PMTC's "no engine" claim is genuinely differentiating against Lynx.

### 8. NativeScript-Vue — the prior-art with the longest track record

**Architecture**: JS runtime (V8 Android, JavaScriptCore iOS) with **reflection-based access to native iOS/Android APIs**. Vue 3 SFCs render to a NativeScript view tree that instantiates real platform widgets (UILabel/UIButton on iOS, android.widget.TextView on Android). NativeScript 8.x adds experimental SwiftUI + Compose interop hooks.

**What they win**:

- **Real platform widgets**. Not canvas, not WebView — `UIView` / `android.view.View` instances. Same widget-level claim PMTC makes.
- **Direct native API access from JS**. You can call `UIAlertController` directly from JS via reflection. Most-flexible native bridge among the cross-platform JS frameworks.
- **Mature** (years in production). NativeScript itself at 8.8 mid-2025. NativeScript-Vue actively maintained.
- **Vue 3 is the source language** — Composition API, SFCs, the full Vue ecosystem.

**Where they fall short of PMTC's pitch**:

- **JS engine on device**. V8 on Android, JSC on iOS. Same engine cost as RN.
- **Reflection-based native access has perf cost on hot paths**. Calling `UIView` methods from JS via reflection is slower than the same call in Swift.
- **Output is JS, not Swift/Kotlin source**. PMTC's "readable native output" claim doesn't translate — NativeScript runs JS that manipulates native views at runtime.
- **Small community vs RN/Flutter**. Hiring pool is tiny. Plugin ecosystem is narrower.
- **iOS App Store reviewers occasionally challenge non-standard apps** — reflection-based JS is unusual enough to draw scrutiny.
- **Web target is not first-class** — mobile-first framework.
- **Source language is Vue** — web teams using Pyreon would have to rewrite in Vue 3.

**Why a user picks PMTC instead**: they want the binary to be smaller (no JS engine), the output to be human-readable Swift/Kotlin, the web target to be first-class, and they're not Vue-first.

**Why a user picks NativeScript-Vue instead**: their team is Vue-first. They need direct native API access from JS for unusual platform integrations. They're shipping today, not in 2028.

**Honest assessment**: NativeScript-Vue's biggest weakness against PMTC is the JS engine — it's the same cost as RN. The biggest strength is shipping today. But it occupies a niche (Vue + native mobile) that overlaps minimally with Pyreon's audience (signals + web). Treating it as a meaningful PMTC competitor would be a stretch.

### 9. Solid Native — the post-mortem of "Solid on RN"

**Architecture**: A thin layer applying SolidJS's reactive primitives (`createSignal`, `createEffect`) over React Native's component model. JSX renders RN primitives but state/reactivity is Solid's signal model.

**Current state**: **Effectively dormant**. npm `solid-native` last published 0.1.2 several years ago. Author (tjjfvi) explicitly states they'd cede the name if anyone built a non-RN-backed alternative. No production usage anywhere notable.

**Why it died**: tracking RN releases as an outside party was a treadmill — every RN version bump required Solid Native to chase. No backing, no ecosystem, no users. Solid's reactive model is excellent; the integration story was structurally fragile.

**Why this matters for PMTC**: PMTC's "signal-based reactivity, compiled to native" pitch is conceptually similar to Solid Native — but PMTC's structural advantage is that it doesn't run on top of someone else's framework (RN). PMTC OWNS the compiler from source to output. No release-treadmill problem.

**Lesson**: building a thin layer over someone else's native framework (Solid Native over RN, or NativeScript-Vue over NativeScript) creates a permanent dependency on the underlying framework's release cadence. PMTC compiles directly to platform code (SwiftUI source, Compose source) and is structurally independent — Apple shipping a new SwiftUI release doesn't require Pyreon to rebuild anything except the emitter's output templates.

### 10. Expo — the toolchain wrapper around React Native

**Architecture**: A React Native framework + cloud toolchain. SDK of pre-built native modules, **EAS Build** (cloud-native build service), **EAS Update** (OTA JS updates), **Expo Router** (file-system routing), **Config Plugins** (programmatic native-project mutation), **Development Builds** (custom Expo Go variants with arbitrary native deps).

**Strategic significance**: as of 2025, **Meta officially recommends Expo as the default RN framework**. `react-native init` is deprecated; Expo is the blessed path. This is the single largest structural shift in the RN ecosystem in years.

**What this means for PMTC**: Expo is RN + polish, so all the RN comparisons apply. The added consideration is that Expo's cloud toolchain (EAS Build, EAS Update) is a real DX advantage that PMTC has zero answer for at any current planned phase. PMTC would need its own cloud build service and OTA story to match — but PMTC has explicitly given up OTA (no JS engine = no dynamic code). The DX gap will be real and permanent.

**Why a user picks Expo+RN instead**: cloud build pipeline, OTA updates, Expo Router (genuinely good), and the entire React Native ecosystem — all in one blessed toolchain. The path of least resistance.

**Why a user picks PMTC instead**: the "no JS engine, real platform widgets" properties matter more than the cloud toolchain convenience. The team can build their own CI for native builds (mature, well-understood).

---

## Where PMTC wins (the defensible claims)

After surveying everything: **PMTC has exactly one genuinely-unoccupied strategic position**:

> _"Same TSX source. Real SwiftUI on iOS. Real Compose on Android. Real DOM on web. No JS engine. No canvas. No WebView. Output reads as idiomatic platform code."_

This is the **"truly native + web + same source"** triple. The cells in the matrix that bold-mark for PMTC are the only row where all three are true.

**Adjacent positions that aren't PMTC's**:

- "Truly native + same source, but no web" → **Skip**
- "Same source + web + native widgets, but JS engine" → **React Native + Expo**
- "Same source + web + no engine, but Skia-rendered (not real widgets)" → **Compose Multiplatform**
- "Truly native + web + no engine + draws own widgets" → **Flutter** (drops "real widgets" but adds desktop)

**The PMTC bet, restated honestly**: there is a market for "I want to write Pyreon TSX once and have it be a real iOS app AND a real Android app AND a real web app, with no compromise on what 'real' means." If that market is large enough to justify 2-3 years of compiler investment, PMTC is strategically right. If the market is dominated by "good enough" frameworks (Flutter for ease, React Native for ecosystem, CMP for Kotlin-first teams), PMTC is over-engineered.

---

## Where PMTC LOSES (the honest admissions)

These are real losses, not framing tricks:

1. **Time-to-market vs every shipping competitor**. CMP iOS shipped May 2025. RN+Expo ships every quarter. Skip ships today. Capacitor ships in a weekend. PMTC's Phase 0 (counter on iOS simulator) is 2-3 months; Phase 1 (production-ready iOS) is +4-6 months on top; Phase 2 (Android parity) +4-6 more; Phase 3 (production polish) +6-12. The 2-3-year envelope is multi-year vs competitors who already ship.

2. **Ecosystem maturity vs React Native + Expo**. RN has had 8+ years for every native module to exist with a binding. Camera, push, biometrics, payments, deep links, AR — all solved with RN packages today. PMTC has to build every binding from scratch as `@pyreon/camera`, `@pyreon/push`, etc. The ecosystem investment is years of work that RN has already amortized.

3. **OTA updates vs RN/Expo**. PMTC explicitly gives this up (no JS engine = no dynamic code). For teams who ship bug fixes hourly, this is a real loss. EAS Update / CodePush can ship a JS fix in minutes; PMTC requires App Store review.

4. **Hot reload polish vs Vite / Flutter / Compose**. PMTC Phase 0 will not ship Vite-HMR-quality hot reload. Flutter's hot reload is genuinely sub-second. Compose Live Edit is fast. PMTC starts behind on DX.

5. **Backing vs JetBrains (CMP) and Meta (RN+Expo)**. PMTC is built inside Pyreon, which is a small team. CMP has JetBrains' multi-year sustained investment. RN+Expo has Meta + Expo Inc. Funding stability matters for multi-year frameworks.

6. **Inspectable native output, but at the cost of compiler fragility**. PMTC's "Swift devs can read the output" claim depends on the compiler producing idiomatic output. Every new SwiftUI / Compose feature is a potential compiler-emitter rewrite. CMP avoids this by being a runtime (Compose itself is the abstraction; SwiftUI emit isn't needed). Skip avoids this by being source-level translation of an existing Swift codebase.

7. **Desktop story is unmentioned in the PMTC plan**. CMP, Flutter, Tauri all ship desktop. PMTC mentions "macOS (future)" and "Linux/Windows desktop (future)" as Phase-many concerns. For teams who care about cross-platform including desktop, PMTC is behind.

8. **Compose Multiplatform's "I don't care that iOS isn't real UIKit" answer might just win**. If most users don't notice the difference between Skia-drawn Cupertino widgets and real UIKit widgets — and the Flutter precedent suggests they don't — then PMTC's central differentiator is invisible to the volume market. CMP wins on time-to-market without the user noticing the compromise.

---

## The strategic question

**Is the "truly native + web + same source" quadrant a real market?**

The honest answer: **unproven**. Three scenarios:

**Scenario 1 — the market is real and underserved**. Teams writing Pyreon today want native mobile, are picky about native-feel, won't accept WebView compromises, won't rewrite in Kotlin/Swift, won't ship a JS engine on device. PMTC ships in 2-3 years and captures them. Strategic win.

**Scenario 2 — the market exists but is captured by CMP first**. CMP's iOS-Skia compromise is invisible to most users. JetBrains' backing means CMP iterates aggressively. By the time PMTC ships, CMP has eaten the multiplatform mindshare. PMTC ships into a market that has already picked the "good enough" answer. Strategic loss.

**Scenario 3 — the market is smaller than assumed**. Most teams either accept WebView shells (Capacitor — millions of apps), or accept React Native's compromises (4M weekly downloads), or accept Flutter's drawn widgets (broad enterprise adoption). The picky "real native widgets matter" audience is small enough that 2-3 years of compiler investment doesn't pay back. Strategic loss.

**The PMTC plan's framing leans toward Scenario 1.** This survey doesn't disprove it — but it also doesn't validate it. The hardest evidence would be: **a survey of current Pyreon users (the actual web audience) asking "would you adopt PMTC if it shipped in 2027 with the quality bar described?"** If <30% say yes, Scenario 3 is likely. If >70% say yes, Scenario 1 is plausible.

The survey hasn't been run. That's the biggest open question this competitor analysis surfaces.

---

## Recommendations for the PMTC roadmap

1. **Treat Skip as the "if PMTC didn't exist, what would Pyreon users be told to use?" benchmark.** Track Skip's coverage of SwiftUI. If Skip Fuse + a Swift→TSX adapter emerged from someone, PMTC's value prop weakens significantly. Re-survey every 6 months.

2. **Watch Compose Multiplatform's iOS evolution closely.** If JetBrains ships a "SwiftUI emit mode" (unlikely but possible — they've talked about it on Slack), PMTC's "real widgets" differentiator collapses to "real widgets AND TSX source." Still valuable but smaller.

3. **Don't try to compete on ecosystem with React Native.** Cede the "I need every native module solved today" market. PMTC's pitch is to teams who want fewer dependencies, not more.

4. **Phase 0 should validate Scenario 1 as much as it validates the compiler.** The technical validation is well-defined (the three pass/fail criteria in the PMTC plan). The market validation is unwritten. Pair the Phase 0 spike with explicit user-survey work: ask 20+ Pyreon teams "would you use this?"

5. **Plan for the "Compose Multiplatform is good enough" objection up front.** PMTC needs a clear answer to "why pay 2 more years of waiting for real UIKit when CMP ships Skia today?" The answer probably involves accessibility, design-system fidelity, and platform-native gesture/scroll/animation feel. If those don't matter for the target audience, the answer is weak.

6. **Consider partial-PMTC modes for de-risking.** Could a Pyreon → Compose Multiplatform target (using CMP's existing runtime, emitting Kotlin) ship in 6-9 months as a Phase-pre-0 spike? That validates the type-mapper and signal-mapper work AND ships something usable before the full SwiftUI emitter is done. Trades the "real widgets on iOS" claim for shipping speed — but if Scenario 2 is the likely outcome anyway, it might be the right strategic move.

7. **Source-level interop story matters more than the PMTC plan emphasizes.** Teams already have Swift / Kotlin codebases. PMTC's ability to drop emitted output INTO an existing Xcode / Android Studio project as a Swift Package / Maven artifact is a real DX win that Skip already does and CMP requires more setup for. Phase 1 should treat "drop into existing project" as a first-class deliverable.

---

## Re-survey cadence

This doc is a snapshot. Multiplatform UI moves fast. Re-survey before any major Phase commitment:

- **Compose Multiplatform**: bump-version every 6 months minimum. Watch for SwiftUI-emit announcements.
- **Skip**: bump every 6 months. Watch Skip Fuse coverage growth.
- **React Native + Expo**: bump every quarter. Watch Bridgeless Mode rollout completion (2026 target).
- **Lynx**: bump every 6 months. Watch ecosystem growth + standalone-app capability.
- **Flutter**: bump every 6 months. Watch Cupertino widget fidelity vs new iOS releases.

Re-do this entire survey if any of:

- A new framework launches in PMTC's quadrant (real widgets + no engine + web + same source).
- CMP or Skip announces a competing position (SwiftUI emit, or web target).
- The PMTC Phase 0 spike succeeds and Phase 1 is being scoped.

---

## What this doc commits to

- **Honest competitive landscape** as of late 2025 / early 2026. No claims invented for marketing purposes.
- **PMTC's positioning is defensible-but-unproven**. The "truly native + web + same source" quadrant is unoccupied today but might be unoccupied because it's not a market worth occupying.
- **Skip and Compose Multiplatform are the two real threats**. Skip on the "if you want native widgets" axis; CMP on the "if you're willing to compromise on widgets" axis. Both are shipping; PMTC is not.
- **The market validation has not been done**. The biggest open question for PMTC isn't technical (the compiler is feasible) — it's whether the target audience is large enough to justify the 2-3-year build.
- **Recommendation: pair the Phase 0 technical spike with a user-survey market spike**. Both must validate before Phase 1 is staffed.
