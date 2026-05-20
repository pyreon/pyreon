# Native platforms — design exploration

**Status**: Strategic design doc. Not approved, not staffed. Author's notes for discussion.
**Goal**: Lay out honest paths for Pyreon → truly-native iOS / Android / desktop apps. Identify which path Pyreon is uniquely positioned to take, and what's hard about it.

---

## The question

Can Pyreon power **truly native** mobile and desktop apps — meaning the app renders to real `UIView` / `View` / `NSView` hierarchies, uses real platform widgets, uses the OS thread model — and not just a styled WebView shell?

Short answer: **yes, and Pyreon's architecture is unusually well-suited for it**. The longer answer is below.

---

## Four serious options (and one disqualified)

### 0. WebView shell (DISQUALIFIED)
Capacitor / Cordova / Tauri-mobile model. Pyreon runs in a WebView, OS APIs accessed via JS plugins. This is not "truly native" — UI is HTML/CSS rendered in a `WKWebView`/`WebView`/`WebView2`. **The user's goal explicitly rules this out.** Listed only for completeness.

### A. Bridge model with platform widgets (the React Native shape)
- JS engine on device (JSC on iOS, Hermes/V8 on Android)
- Native side owns UI tree (real `UIView` / `View` hierarchies, real platform widgets)
- Bridge between JS and native UI thread carries instructions ("create a view of type X with these properties", "update view Y's property Z")
- Pyreon runs in the JS layer; `@pyreon/runtime-native` translates VNode mounts into bridge messages
- Layout via Yoga (Facebook's flexbox-on-native, same engine React Native uses)

**Pros:** Real native widgets. Hot-reload achievable. Reuse Pyreon's web component code mostly as-is. 10 years of well-trodden territory (React Native, NativeScript).

**Cons:** The bridge is a real cost. JS thread and UI thread are separate; every UI update crosses the boundary. React Native has spent the last 5 years (Fabric, JSI, TurboModules) trying to eliminate that cost. Pyreon-native would inherit the same constraints.

### B. Compile to native source (SwiftUI / Compose emit)
- Pyreon compiler grows a new target: `--target swiftui` / `--target compose`
- Pyreon components → SwiftUI views; signals → SwiftUI `@State` / Combine publishers; lifecycle hooks → SwiftUI view modifiers
- Output is Swift / Kotlin source compiled into the app binary
- Zero JS runtime, zero bridge cost, fully native

**Pros:** Best-possible runtime performance. No JS engine to ship. Truly indistinguishable from a hand-written SwiftUI app.

**Cons:** Cannot dynamically update the app — only static behavior. Massive compiler work — essentially rewriting Pyreon's reactive graph in Swift/Kotlin (the source-level emit only generates the structure; the runtime semantics need a Swift/Kotlin equivalent of `signal`/`computed`/`effect`). **Loses the unified-codebase story** — apps using this path can't share runtime code with the web target; only component source survives. Apple's `@State`/`@Observable` and Kotlin's `StateFlow`/`MutableState` are already close enough that we're producing redundant code.

### C. Hybrid — bridge model + per-platform native widgets + signal-aware bridge protocol (the Pyreon angle)
- Same shape as Option A, but the bridge protocol is **signal-aware** rather than VDOM-diff-based
- Pyreon's reactivity already emits individual property changes (`signal.set(x)` → "this one property on this one node changed"), not VDOM diffs
- Bridge sends granular property-update messages, NOT serialized VNode trees
- Net effect: smaller bridge payloads, tighter coupling between signal subscription and native UI update than React Native achieves

**Pros:** Real native widgets (option A). Cheaper bridge than React Native by construction (no VDOM diff to serialize). Reuses Pyreon's signal-based architecture as a feature, not a translation. Hot reload achievable via Pyreon's existing HMR runtime + native-side view state preservation.

**Cons:** Still ships a JS engine. Still has a bridge (even if cheaper). Same app-store / dynamic-code constraints as React Native.

### D. Skia / custom rendering (Flutter shape)
- Pyreon-native ships its own pixel renderer (Skia, Metal, Vulkan)
- Doesn't use platform widgets at all — draws everything from scratch
- Cross-platform identical rendering by definition

**Pros:** Pixel-perfect cross-platform. No platform-widget differences.

**Cons:** **Doesn't feel native** — text edit cursors, scroll inertia, gesture recognizers, accessibility, system fonts, all custom. Apple/Google evolve their design language every year; you have to keep up manually. Enormous engineering investment for a result users perceive as "not quite right". Flutter's been doing this for 7 years and still has uncanny-valley moments.

---

## Recommendation: **Option C** (signal-aware bridge with native widgets)

Pyreon's architectural advantage is the **signal-based reactivity model** — the runtime knows precisely which property of which node changed. Every other JS-on-native approach (React Native, NativeScript) has to compute that diff. Pyreon already has it.

This makes the bridge protocol smaller, the JS↔native coupling tighter, and the per-property-update path shorter than React Native's. The thing RN has spent the last 5 years rebuilding (Fabric/JSI to bypass the bridge bottleneck), Pyreon would have for free from day 1 because its renderer was never a VDOM diff in the first place.

**Three concrete unique angles:**

1. **Bridge granularity matches signal granularity.** A signal change is exactly one bridge message: `{ nodeId, prop, value }`. RN sends batched JSON-encoded property maps because its renderer doesn't know what changed without diffing.
2. **Template cloning maps to view recycling.** `@pyreon/runtime-dom`'s `_tpl()` model — bake the static structure once, only do reactive updates on changes — is exactly how `UICollectionView` cell reuse and `RecyclerView` work natively. The compiler's existing `_tpl()` emit could be repurposed to produce native-view templates.
3. **Same component, multiple targets.** A Pyreon component IS already platform-agnostic (depends only on `@pyreon/core` + `@pyreon/reactivity`). Render it through `runtime-dom` for web, `runtime-server` for SSR, `runtime-native` for iOS/Android, no source change. Vue/Svelte attempted this story; React/RN didn't — they split into `react-dom` and `react-native` with different element types. Pyreon doesn't need to split.

Option B (compile to SwiftUI source) is an interesting future evolution but should NOT be the MVP — it loses the unified-codebase story which is the strategic moat.

---

## What's already in place (the survey from the Explore agent)

| Layer | Coupling today | Work to slot in native |
|---|---|---|
| `@pyreon/core` | Fully abstract — VNode is platform-neutral, lifecycle is platform-neutral | Zero |
| `@pyreon/reactivity` | Pure JS, no DOM | Zero |
| `@pyreon/compiler` | Emits `_tpl(htmlString, bindFn)` — the HTML is DOM-coupled; the bind shape is generic | Modest: either add `--target native` emitting native template descriptors, or have the bind callback use generic element APIs |
| `@pyreon/runtime-dom` | DOM-coupled by design (parallel implementation) | N/A — `@pyreon/runtime-native` is a new sibling |
| `@pyreon/runtime-server` | String output (parallel implementation) | N/A — proves the renderer pattern |
| `@pyreon/styler` | DOM-coupled at sheet-injection layer; design abstract | Moderate refactor: abstract the sheet-injection interface |
| `@pyreon/rocketstyle` | Consumes styler output, no DOM contact | Zero |
| `@pyreon/unistyle` | Tokens + breakpoints, no DOM | Zero |
| `@pyreon/router` | `window.location`, `history`, `popstate` | High — separate native nav layer; not a blocker if MVP skips routing |

The renderer pattern (DOM + Server in parallel today) is the load-bearing architectural choice that makes native viable. **`@pyreon/runtime-native` slots into the existing pattern; it does not require redesigning anything Pyreon-side.** The hard work is on the *native* side of the bridge.

---

## The hard parts (honest list)

Things that will take time regardless of approach:

### 1. Platform widget bindings (high effort, ongoing)
UIKit + AppKit + AndroidView + Compose each have hundreds of widgets. RN-core covers ~20 of them; `react-native-community` packages cover the rest. Pyreon-native would face the same surface: `Image`, `ScrollView`, `TextInput`, `Switch`, `Picker`, `WebView` (embed), `Camera`, `MapView`, etc. This is the **bulk of the work** in a native framework and never finishes — Apple ships new UIKit widgets every WWDC.

**Mitigation**: Start with 10 essential widgets (`View`, `Text`, `Image`, `ScrollView`, `TextInput`, `Button`, `List`, `Touchable`, `StatusBar`, `KeyboardAvoidingView`) — covers ~80% of typical mobile app needs. Add as demand surfaces.

### 2. Layout engine integration
Web's CSS-box-model + Flexbox doesn't map 1:1 to iOS Auto Layout or Android ConstraintLayout. The pragmatic answer is Yoga (Facebook's flexbox-on-native, MIT-licensed, used by React Native, Litho, Fabric).

**Action**: Embed Yoga in `runtime-native`. Pyreon styles → Yoga layout descriptors → native view frame application.

### 3. App Store dynamic-code constraints
Apple Rule 4.7 allows shipping JS engines and dynamically-loaded JS *if* the JS doesn't "change the primary purpose of the app, provide a store-like interface, or include the ability to download executable code beyond what is bundled at submission." Practical meaning: Pyreon-native CAN ship a JS runtime + Pyreon code; over-the-air JS bundle updates work like Code Push (RN/CodePush approach). This is the same constraint RN apps live with — solved territory.

### 4. JS engine choice
- **iOS**: Must use JavaScriptCore (Apple disallows embedding alternative JS engines for non-WebKit purposes; this is why RN uses JSC and Hermes; Hermes works on iOS as of recent versions).
- **Android**: Hermes (RN's choice, faster cold start, smaller binary), V8 (Chrome's, larger ecosystem), JavaScriptCore (works but uncommon on Android).

**Action**: Mirror RN's choice — Hermes on both platforms when feasible (faster cold start, smaller binary, the "JS-native UI" niche RN has shown to be viable).

### 5. Hot reload + Fast Refresh
RN's Fast Refresh (signal-component state preservation across reload) took years to mature. Pyreon already has signal-preserving HMR via the Vite plugin (`__hmr_signal` registry). The native equivalent needs:
- Native-side view-state preservation (UIView's text input state, scroll position, etc.)
- JS reload + signal-restoration without losing native UI handles

**Pyreon's HMR signal-preserving infrastructure** already solves the JS half. The native half is new work but well-studied (RN's implementation is the reference).

### 6. Router
Web routing model (URL → component tree) doesn't map cleanly to native nav (UINavigationController push/pop stacks, Android FragmentManager). `@pyreon/router` is unusable as-is on native.

**Action**: Build a thin `@pyreon/router-native` that maps Pyreon's route DSL to native nav events. Don't reuse the web router. Skip in MVP — first apps can use platform-native nav directly through bindings.

### 7. Build / packaging / signing
Xcode + Android Studio + Fastlane + Gradle + provisioning profiles + Play Store + App Store Connect. This is the boring-but-mandatory infrastructure. RN's `react-native` CLI handles it; Pyreon would need an equivalent (`@pyreon/native-cli`?).

### 8. Performance ceiling
Even with the signal-aware bridge advantage, JS-driven UI is slower than compiled SwiftUI/Compose. Realistic ceiling: **match React Native's perf, beat it on first-paint and animation jank, fall short of native by 20-50% on heavy workloads**. That's the honest envelope. "Indistinguishable from native" is not on the table for any JS-on-native approach.

---

## Staged MVP path (8-16 weeks elapsed for a credible demo)

### Phase 0 (1 week) — feasibility spike
- Bind one signal to one `UIView.backgroundColor`. Pyreon runs in JSC on a simulator; signal change → bridge message → property update.
- Goal: prove the protocol design works end-to-end. No real app yet.
- Deliverable: counter app on iOS simulator.

### Phase 1 (3-4 weeks) — minimum viable renderer
- `@pyreon/runtime-native` skeleton with `mount(vnode, rootView)`, `mountChild`, `applyProps`.
- 5 native widgets: `View`, `Text`, `Image`, `Button`, `ScrollView`.
- Yoga layout engine wired up.
- Hot reload via Pyreon's existing `__hmr_signal` registry + Metro-style native reload trigger.
- Deliverable: a non-trivial list-rendering app (TodoMVC) on iOS simulator.

### Phase 2 (4-6 weeks) — Android parity + remaining widgets
- Mirror Phase 1 on Android (Hermes runtime + JNI bridge to Android Views).
- Add 5 more widgets: `TextInput`, `Switch`, `Touchable`, `List` (UICollectionView / RecyclerView with `_tpl`-cell-reuse), `StatusBar`.
- Deliverable: TodoMVC on both platforms, same Pyreon source.

### Phase 3 (2-4 weeks) — styling + theming
- Refactor `@pyreon/styler` to abstract the sheet-injection layer.
- Native sheet adapter: iOS UIAppearance / Android Material Theme.
- `@pyreon/rocketstyle` + `@pyreon/unistyle` work unchanged.
- Deliverable: themed app, dark mode switch via existing Pyreon mode system.

### Phase 4 (ongoing) — widget surface + ecosystem
- Add bindings as needed: camera, push notifications, maps, biometrics, etc.
- This phase **never finishes** — it's the long-tail cost of any native framework.

**Total to credible demo**: ~3-4 months. To production-readiness on iOS/Android: probably 12-18 months with a small dedicated team. To match React Native's ecosystem depth: years.

---

## Strategic positioning

The honest pitch if this ships:

> *Pyreon-native: write once, render to web, server (SSR), AND iOS/Android native widgets. Signal-based reactivity means the bridge is fundamentally cheaper than React Native's — every UI update is a single property message, never a serialized diff. Hot reload preserves both component state and native UI state. 10-100× smaller bridge payloads, same widget fidelity.*

What this is NOT:

- Not "the fastest mobile framework" — SwiftUI/Compose win on raw perf
- Not "the same code as web with zero changes" — layout primitives differ (flexbox vs Auto Layout), platform widgets differ from HTML elements, lifecycle is different
- Not "easier than learning Swift/Kotlin from scratch" for a brand-new mobile dev — RN/Pyreon-native is faster IF you already know the web framework

What it IS:

- The cheapest path to **a truly-native mobile app from a Pyreon web codebase**
- A bridge architecture that's fundamentally better-positioned than React Native's because the signal model removes the diff-and-serialize cost
- A unified-codebase story stronger than RN (because Pyreon's `runtime-dom`/`runtime-server`/`runtime-native` are siblings, not separate component models)

---

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Widget binding surface never finishes | Certain | Same as RN — ship 10 essentials, grow ecosystem; don't try to be complete |
| App Store rejection over dynamic JS | Low | RN apps ship daily; Apple's Rule 4.7 is well-trodden |
| Performance falls short of fully-native | Certain | Be honest; position against RN, not SwiftUI |
| JS engine choice hurts cold start | Medium | Use Hermes (RN's pick); has 6+ years of optimization for this exact use case |
| Maintenance burden — Apple/Google ship widget updates yearly | High | Open-source community maintenance OR commercial sponsor; both work, RN survives on the latter |
| Pyreon's compiler-to-native source path (Option B) emerges as a better fit later | Possible | Option C doesn't preclude Option B — could ship as a second target |

---

## What I would NOT do

- **Don't rewrite the renderer from scratch.** The DOM + Server parallel-walker pattern is exactly the right shape; native is a third sibling, not a redesign.
- **Don't try to bridge the existing `@pyreon/router`.** Native nav is a different model. Write `@pyreon/router-native` from scratch; share only the URL-parsing utility.
- **Don't ship a Skia renderer.** Flutter has shown the engineering cost; Pyreon doesn't have a Flutter team.
- **Don't bind to UIKit/AndroidView APIs directly in JS.** That's the bridge cost RN built FFI/JSI to eliminate. Use a typed protocol — `{ nodeId, prop, value }` messages — with native-side translation. Same shape as React Native's Fabric.
- **Don't promise SwiftUI-class performance.** That's Option B's territory; Option C can't match it without becoming Option B.

---

## What I'd want to validate before committing

1. **Bridge throughput.** Build the Phase 0 spike. Measure: with 1000 signals firing per frame, can iOS UI hit 60fps? If not, can we batch the bridge to recover? (RN's answer is "yes, with JSI"; Pyreon's signal-batch primitive (`batch()`) is the equivalent.)
2. **Yoga as the layout engine.** Confirm Pyreon's CSS-style API can compile to Yoga inputs without losing expressiveness.
3. **Hot reload UX.** Build a minimum that proves signal-preserving HMR works across the bridge. If this feels wrong, the whole DX value-prop weakens.
4. **One real partner app.** Find a Pyreon user with a mobile project who'd help drive the widget surface. Eyeballing what's needed without a real consumer leads to building 10 widgets nobody asks for.

If those four come back positive, Option C is worth a focused team-quarter to prove out. If any one fails, regroup.

---

## Open questions for the user

- **Time horizon**: is this a "what's possible in 6 months" or a "what does Pyreon need in 5 years" exploration?
- **Resource model**: solo / single-developer effort, or hired team?
- **Target ordering**: iOS-first (simpler ecosystem, harder gate), Android-first (broader user base, more open), or simultaneous?
- **Production users in mind**: any specific user driving this, or a strategic platform play?
- **Compile-to-source as future evolution**: is Option B (SwiftUI/Compose source emit) attractive long-term, or is the unified-runtime story (Option C) the durable bet?

---

## TL;DR

- **Yes, this is genuinely viable** — Pyreon's architecture is more native-friendly than React's was when RN started.
- **Recommended approach is Option C** — JS engine on device + per-platform renderer + signal-aware bridge protocol. The signal model is a structural advantage RN doesn't have.
- **MVP in 3-4 months** with a focused effort; production-ready in 12-18 months with a small team; ecosystem parity with RN takes years.
- **The unique pitch**: same component → web + SSR + native, with a bridge that's fundamentally cheaper than RN's by virtue of signals.
- **Don't ship Option B yet** — losing the unified-codebase story to gain SwiftUI-class performance is the wrong trade for an MVP.
- **The hard parts aren't Pyreon-side** — the renderer pattern slots in cleanly. The hard parts are platform bindings, hot reload, and the long-tail ecosystem cost every native framework pays.
