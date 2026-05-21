# Native platforms — chosen direction

**Status**: Strategic direction doc. Direction CHOSEN; not yet approved, staffed, or scheduled.
**Decision**: Pyreon's path to truly-native iOS / Android / desktop apps is the **Pyreon Multi-Target Compiler (PMTC)**: one Pyreon source compiles to native Swift (SwiftUI) for iOS, native Kotlin (Jetpack Compose) for Android, JS+DOM for web (today's behavior), and JS+HTML strings for SSR (today's behavior). Zero JS engine on mobile. Zero bridge. The output is structurally indistinguishable from a hand-written SwiftUI / Compose app.

**Prior survey**: a multi-option survey (RN bridge / compile-to-source / signal-aware bridge / Skia) is archived to [`.claude/plans/archive/native-platforms-survey-2026-05.md`](archive/native-platforms-survey-2026-05.md). That survey's recommendation (Option C — signal-aware bridge) was correct under "3-4 month MVP" framing. Under the user's reframed scope — "truly native, take all the time, build from scratch if needed, one day" — the answer shifted to compile-to-source, elevated and renamed PMTC.

---

## TL;DR

- **One Pyreon JSX source. Native binary on every platform.** No WebView shell, no JS engine on mobile, no bridge. The compiler emits idiomatic platform code.
- **Why this works structurally**: Pyreon's signal-based reactivity model maps directly onto SwiftUI's `@State`/`@Observable` and Compose's `MutableState`. We're not translating — we're using each platform's native vocabulary for the same idea.
- **Same code, same styles**: `@pyreon/styler` + `@pyreon/rocketstyle` + `@pyreon/unistyle` survive cross-platform via per-target style emitters. CSS-in-JS on web; SwiftUI `ViewModifier` chains on iOS; Compose `Modifier` chains on Android.
- **Per-platform concerns plug in cleanly**: abstract Pyreon API (`@pyreon/router`, `@pyreon/camera`, …) + per-platform implementations (`@pyreon/router-ios`, `@pyreon/router-android`). User code calls the abstract API; the compiler picks the right binding per target.
- **The cost is years, not months**: ~2-3 years to production-ready iOS + Android with a focused team. This is a multi-year strategic commitment, not an MVP.
- **What we lose vs JS-on-native (RN-style)**: over-the-air dynamic updates. App-store releases only. Acceptable trade for "truly native."
- **What we gain**: a story no other framework can tell — *same component, every platform, native everywhere, signal model the whole way down*.

---

## The single-source contract

You write ONE Pyreon component. The compiler emits per-target.

| Target | Compiler emits | Runtime |
|---|---|---|
| **Web** | JS + DOM templates (today's path) | Pyreon JS runtime |
| **SSR** | JS rendering to HTML strings (today's path) | Pyreon JS runtime |
| **iOS** | Swift + SwiftUI | Native — no JS engine, no bridge |
| **Android** | Kotlin + Jetpack Compose | Native — no JS engine, no bridge |
| **macOS** (future) | Swift + AppKit / SwiftUI | Native |
| **Linux / Windows desktop** (future) | Compose for Desktop OR Rust + iced/egui | Native |

The user never writes platform code for the common path. They write Pyreon. The compiler does the work.

---

## "Same code" — worked example

User source (Pyreon JSX, identical for every target):

```tsx
// Counter.tsx — ONE source, all platforms
import { signal } from '@pyreon/reactivity'
import { Button, View, Text } from '@pyreon/ui-components'

export function Counter() {
  const count = signal(0)
  return (
    <View padding="md" alignItems="center">
      <Text size="xl">{count}</Text>
      <Button onClick={() => count.set(count() + 1)}>Increment</Button>
    </View>
  )
}
```

### Web output (today's compiler, unchanged)

```js
const _$h0 = _tpl(`<div class="view-xyz"><span class="text-abc"></span><button class="btn-def">Increment</button></div>`)
export function Counter() {
  const count = signal(0)
  const root = _$h0.cloneNode(true)
  _bindText(count, root.querySelector('span'))
  root.querySelector('button').addEventListener('click', () => count.set(count() + 1))
  return root
}
```

### iOS output (new emitter)

```swift
struct Counter: View {
  @State private var count: Int = 0
  var body: some View {
    VStack(alignment: .center, spacing: PyreonTokens.spacing.md) {
      Text("\(count)")
        .font(PyreonTokens.font.xl)
      Button("Increment") {
        count += 1
      }
      .buttonStyle(PyreonButtonStyle())
    }
    .padding(PyreonTokens.spacing.md)
  }
}
```

### Android output (new emitter)

```kotlin
@Composable
fun Counter() {
  var count by remember { mutableStateOf(0) }
  Column(
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.spacedBy(PyreonTokens.spacing.md),
    modifier = Modifier.padding(PyreonTokens.spacing.md)
  ) {
    Text(
      text = "$count",
      style = PyreonTokens.font.xl
    )
    PyreonButton(onClick = { count++ }) {
      Text("Increment")
    }
  }
}
```

The user's source is **byte-for-byte the same**. The compiler emits idiomatic per-target output. SwiftUI devs reading the iOS output see SwiftUI. Compose devs reading the Android output see Compose. No "this looks weird" reactions.

---

## Why this maps structurally

The reason PMTC isn't a hack: SwiftUI and Compose are themselves signal-based reactive UI frameworks. They use the same idea Pyreon uses; they just call the primitives different names. Pyreon compiling onto them is structural fit, not translation:

| Pyreon construct | SwiftUI equivalent | Compose equivalent |
|---|---|---|
| `signal<T>(initial)` | `@State private var x: T = initial` | `var x by remember { mutableStateOf(initial) }` |
| `computed(() => f(a(), b()))` | computed property reading `@State` | `derivedStateOf { f(a, b) }` |
| `effect(() => { /* runs on dep change */ })` | `.onChange(of: dep) { ... }` | `LaunchedEffect(dep) { ... }` |
| `<For each={items} by={i => i.id}>{i => ...}</For>` | `ForEach(items, id: \.id) { i in ... }` | `LazyColumn { items(items, key = { it.id }) { ... } }` |
| `<Show when={cond}>{...}</Show>` | `if cond { ... }` view builder | `if (cond) { ... }` composable |
| `onMount(() => { ...; return cleanup })` | `.onAppear { ... }.onDisappear { cleanup }` | `DisposableEffect(Unit) { onDispose { cleanup } }` |
| `onUnmount(() => ...)` | `.onDisappear { ... }` | `DisposableEffect(Unit) { onDispose { ... } }` |
| `provide(ctx, value)` | `.environment(ctx, value)` | `CompositionLocalProvider(ctx provides value) { ... }` |
| `useContext(ctx)` | `@Environment(ctx) var ctx` | `val v = ctx.current` |
| `batch(() => { ... })` | implicit (SwiftUI batches in one render pass) | `Snapshot.withMutableSnapshot { ... }` |
| `createStore(...)` | `@Observable class Store { ... }` | `class Store { val x = mutableStateOf(...) }` |
| `signal<'a' \| 'b' \| 'c'>('a')` (string-literal union) | `@State private var x: X = .a` + `enum X: String { case a, b, c }` | `var x by remember { mutableStateOf(X.a) }` + `enum class X { a, b, c }` |
| `<input value={s} onInput={e => s.set(e.target.value)}>` (two-way binding pattern) | `TextField("…", text: $s)` (compact Binding form via `$`) | `TextField(value = s, onValueChange = { s = it })` (already matches Pyreon shape) |

These aren't translations the way "JSX → React" or "JSX → Vue templates" are translations. These are the same construct expressed in each framework's native vocabulary. Pyreon's reactive primitives are the lingua franca; SwiftUI / Compose / DOM are the dialects.

### Two patterns added in the post-TodoMVC-walkthrough revision

Both surfaced when the [TodoMVC walkthrough](./native-platforms-todomvc-walkthrough.md) (#799) composed the primitives into a real app rather than testing them in isolation. The original mapping table covered them implicitly (string-literal unions through "signal" + "type mapper", two-way bindings through "event handler" + "signal write"); naming them explicitly avoids per-case re-derivation in every Phase 0/1 compiler PR.

- **String-literal unions** (e.g. `signal<'all' | 'active' | 'completed'>('all')`) compile to native enums. iOS / Android both gain exhaustive `switch` / `when` checks, IDE autocomplete on values, and zero-cost-of-typos at use sites. The web target keeps the existing string-comparison emit shape (no behavior change). Implementation lands in Phase 0 PR 5d (type-mapper unions — see [Phase 0 roadmap](./native-platforms-phase0-roadmap.md)).

- **Two-way bindings on form inputs** require special-case compiler recognition because SwiftUI's `Binding` shape is conceptually different from Pyreon's signal+onInput pattern. The compiler detects the `<TextField value={signal} onInput={(e) => signal.set(e.target.value)}>` pattern (and its inverse-onInput variants) and emits `TextField("…", text: $signal)` on Swift. Kotlin's Compose `TextField(value=..., onValueChange=...)` already matches Pyreon's source shape, no special handling needed. Same pattern applies to `<Slider>`, `<Toggle>` (`Switch`), `<Picker>`, `<DatePicker>`. Implementation is a Phase 1 PR ("two-way binding emission" — named in the TodoMVC walkthrough's gap list).

---

## "Same styles" — the styling system survives cross-platform

Three layers, each with a per-target story:

### Layer 1: `@pyreon/unistyle` — platform-agnostic tokens

`@pyreon/unistyle` already exposes only primitives (numbers + strings): spacing tokens, breakpoint values, typography scales, color values. These survive cross-platform untouched.

The compiler emits a `PyreonTokens` constant per target:

```swift
// iOS: PyreonTokens.swift (compiler-generated)
struct PyreonTokens {
  struct Spacing {
    static let xs: CGFloat = 4
    static let sm: CGFloat = 8
    static let md: CGFloat = 16
    static let lg: CGFloat = 24
  }
  struct Font {
    static let xl: Font = .system(size: 20, weight: .semibold)
  }
}
```

```kotlin
// Android: PyreonTokens.kt (compiler-generated)
object PyreonTokens {
  object Spacing {
    val xs = 4.dp
    val sm = 8.dp
    val md = 16.dp
    val lg = 24.dp
  }
  object Font {
    val xl = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
  }
}
```

Same tokens, native types. Zero user effort.

### Layer 2: `@pyreon/styler` — CSS-in-JS, per-target emitter

`@pyreon/styler`'s declarative style API gets a per-target emitter:

```tsx
const Button = styled('button')`
  background: ${t => t.color.primary};
  padding: ${t => t.spacing.md};
  border-radius: ${t => t.radius.md};
`
```

- **Web**: emits CSS rules into a `<style>` sheet (today's behavior)
- **iOS**: emits a `ViewModifier` struct with `.background()` / `.padding()` / `.cornerRadius()` chain
- **Android**: emits a `Modifier` chain with `Modifier.background()` / `Modifier.padding()` / `Modifier.clip(RoundedCornerShape(...))`

The structural shape is the same on every target — a description of how to style a primitive — but the output uses the platform's native styling primitives.

### Layer 3: `@pyreon/rocketstyle` — multi-state styling, compile-time variant emit

`@pyreon/rocketstyle` (dimensions: `state`, `size`, `variant`, themes, dark/light) compiles to **per-platform style descriptors**. The dimension system survives because it's a description-of-styling, not actual CSS.

User code:

```tsx
<Button state="primary" size="medium" onClick={onSave}>Save</Button>
```

iOS output:

```swift
Button("Save") { onSave() }
  .modifier(PyreonButton(state: .primary, size: .medium))

// Compiler-generated from rocketstyle definition
struct PyreonButton: ViewModifier {
  let state: ButtonState
  let size: ButtonSize
  func body(content: Content) -> some View {
    content
      .padding(.horizontal, size == .medium ? 16 : 12)
      .padding(.vertical, size == .medium ? 8 : 6)
      .background(state == .primary ? Color.blue : Color.gray)
      .foregroundColor(state == .primary ? .white : .black)
      .cornerRadius(8)
  }
}
```

Android output:

```kotlin
PyreonButton(
  state = ButtonState.Primary,
  size = ButtonSize.Medium,
  onClick = onSave
) { Text("Save") }

// Compiler-generated from rocketstyle definition
@Composable
fun PyreonButton(
  state: ButtonState,
  size: ButtonSize,
  onClick: () -> Unit,
  content: @Composable () -> Unit
) {
  val padding = when (size) {
    ButtonSize.Medium -> PaddingValues(horizontal = 16.dp, vertical = 8.dp)
    ButtonSize.Small -> PaddingValues(horizontal = 12.dp, vertical = 6.dp)
  }
  val bg = when (state) {
    ButtonState.Primary -> Color.Blue
    else -> Color.Gray
  }
  Button(
    onClick = onClick,
    colors = ButtonDefaults.buttonColors(containerColor = bg),
    contentPadding = padding,
    shape = RoundedCornerShape(8.dp)
  ) { content() }
}
```

You write rocketstyle **once**, in Pyreon JSX. Both native targets get idiomatic per-platform implementations from the compiler.

### Themes (light/dark)

`@pyreon/ui-theme`'s `light` / `dark` variants compile to:
- **Web**: today's class-swap + CSS-variable approach
- **iOS**: `@Environment(\.colorScheme)` — system-driven, no JS, native dark-mode switching
- **Android**: `MaterialTheme.colorScheme` (or `isSystemInDarkTheme()` if needed) — system-driven

Dark-mode switching is native on every platform. No JS runtime, no manual prop-drilling.

---

## "Different routing etc if needed" — the per-platform abstraction layer

Platform-specific concerns plug in through a **stable abstract Pyreon API** with per-platform implementations. The user code calls the abstract API; the compiler resolves the right binding per target.

### Routing

User code is identical on every platform:

```tsx
// User code (web + iOS + Android)
import { useNavigate, Route, Routes } from '@pyreon/router'

function App() {
  return (
    <Routes>
      <Route path="/" component={Home} />
      <Route path="/profile/:id" component={Profile} />
    </Routes>
  )
}

function Home() {
  const nav = useNavigate()
  return <Button onClick={() => nav.push('/profile/42')}>Open</Button>
}
```

Per-platform implementations:

| Platform | Implementation |
|---|---|
| **Web** | `@pyreon/router` — `history.pushState`, URL matching, popstate handling (today's package) |
| **iOS** | `@pyreon/router-ios` — SwiftUI `NavigationStack` with typed `NavigationLink` destinations. `nav.push('/profile/42')` compiles to `path.append(ProfileDestination(id: 42))` |
| **Android** | `@pyreon/router-android` — Compose `NavController` + `NavHost` with composable destinations. `nav.push('/profile/42')` compiles to `navController.navigate("profile/42")` |

The compiler swaps the implementation at emit-time. User code never references platform routing primitives.

### Platform APIs (camera, biometrics, push, …)

Same pattern. Single abstract API; per-platform implementation; compiler picks the right one.

User code:

```tsx
import { useCamera } from '@pyreon/camera'

function ScanScreen() {
  const camera = useCamera({ facing: 'rear' })
  return (
    <View>
      {() => camera.preview()}
    </View>
  )
}
```

| Platform | Implementation |
|---|---|
| **Web** | `getUserMedia()` → `<video>` element rendering the camera stream |
| **iOS** | `AVCaptureSession` → `UIViewRepresentable`-wrapped `AVCaptureVideoPreviewLayer` |
| **Android** | `CameraX` → `AndroidView`-wrapped `PreviewView` from `androidx.camera.view` |

The abstract `@pyreon/camera` package ships the **TypeScript interface + the JS/web implementation**. Native implementations ship as `@pyreon/camera-ios` (Swift) and `@pyreon/camera-android` (Kotlin), part of the native build toolchain. The compiler resolves which one to link based on target.

### Escape hatch: native code blocks

For platform-specific functionality with no cross-platform abstraction (e.g., iOS's pressure-sensitive touch with no web/Android equivalent), Pyreon supports inline native blocks:

```tsx
function PressureDemo() {
  const force = signal<number>(0)
  return (
    <View>
      <native:ios>
        {`
          // Real Swift — passes through unchanged
          var pressure: CGFloat = 0
          /* iOS-only API access */
        `}
      </native:ios>
      <Text>{force}</Text>
    </View>
  )
}
```

`<native:ios>` and `<native:android>` blocks pass through to the per-platform output verbatim. Other targets ignore the block (web sees `null`, Android sees `null`).

**Use sparingly.** The whole point of PMTC is to NOT need these — every cross-platform concern has a Pyreon abstract API, and abstractions like camera/push/biometrics are pre-built. Native blocks are for the truly unique-to-one-platform edge cases.

---

## What we build vs reuse

| Category | We build | We reuse |
|---|---|---|
| Compiler | Swift emitter, Kotlin emitter, type mapper (TS → Swift/Kotlin generics, async, error types), signal → `@State` mapper, rocketstyle → ViewModifier emitter | Existing JS emitter (today's compiler), JSX parser |
| Reactivity runtime | Per-platform compile-time mapping (signals → @State / MutableState — almost no runtime code needed) | Existing JS reactivity for web/SSR |
| Components | Pyreon framework packages stay JS-first; their LOGIC compiles, but per-platform UI bindings are new | `@pyreon/core`, `@pyreon/reactivity`, `@pyreon/store`, `@pyreon/form`, `@pyreon/query` — all platform-neutral, just compile |
| UI primitives | iOS/Android native bindings for `<View>`, `<Text>`, `<Button>`, `<ScrollView>`, `<TextInput>`, etc. | SwiftUI + Compose (we emit FOR them; not against them) |
| Styler / theming | Per-target emitters for CSS / `ViewModifier` / `Modifier` chains | `@pyreon/unistyle` tokens, `@pyreon/rocketstyle` dimension system — unchanged user-facing API |
| Routing | `@pyreon/router-ios` (NavigationStack), `@pyreon/router-android` (NavController) | `@pyreon/router` for web (today) |
| Platform APIs | Per-API native bindings on demand (camera, biometrics, push, …) | Pyreon abstract interfaces (`@pyreon/camera` etc.) |
| Build / packaging | `@pyreon/native-cli` (Xcode + Gradle integration; Fastlane pipelines) | Vite for web (today) |
| Hot reload (dev) | Compiler incremental recompile + native-side live edit (Swift HotReloading library, Compose Live Edit) | Vite HMR for web (today) |

The big-budget items are the **compiler emitters** (Swift + Kotlin) and the **UI primitive bindings** (iOS + Android per-widget). Everything else either survives unchanged or is small per-target glue.

---

## What's lost vs JS-on-native frameworks (RN-style)

- **Over-the-air dynamic code updates**: gone. The app is a native binary; updates ship through the App Store / Play Store. Bug fixes need a release. Acceptable trade for true-native.
- **Cross-platform `eval` / dynamic component loading**: gone. No JS engine in the app to execute dynamically-loaded code.
- **Hot reload as polished as Vite HMR**: harder. PMTC needs incremental recompile + native HMR. Tools exist (Swift HotReloading, Compose Live Edit) but neither matches Vite's instant feedback.
- **Some debugging ergonomics**: Pyreon source maps to compiled Swift/Kotlin. Breakpoints work, but stack traces point at compiled output. Source-map-quality tooling has to be built.

## What's gained

- **Truly native binary**: indistinguishable from hand-written SwiftUI / Compose at the output level. Same perf, same cold start, same App Store size budget, same accessibility, same OS gestures, same animations, same scroll feel.
- **Single source codebase**: ONE Pyreon component renders on every target. No web/native split. Bug fixes apply once.
- **Native idiom**: output reads as idiomatic Swift / Kotlin. Native devs can drop in and immediately recognize what's happening. Onboarding is no harder than reading any SwiftUI/Compose codebase.
- **First-class platform tooling**: Xcode (Instruments, Memory Graph, View Debugger), Android Studio (Profiler, Layout Inspector), all work natively on the output because the output IS native code.
- **No JS engine size cost**: -10 MB to -20 MB binary size vs RN-style apps (JSC alone is ~10 MB).
- **Battery life parity with hand-written native apps**: no V8/JSC JIT churn.

---

## Honest timeline

| Phase | Duration | Deliverable |
|---|---|---|
| **Phase 0** — feasibility spike | 2-3 months focused | One Pyreon component compiling to SwiftUI + rendering on iOS simulator. Proves the type-mapping and signal-mapping work. Counter app. |
| **Phase 1** — iOS MVP | +4-6 months | Counter, list, form. 10 native widget bindings (`View`, `Text`, `Image`, `ScrollView`, `Button`, `TextInput`, `Switch`, `Touchable`, `Stack`, `StatusBar`). Basic styler emitter. iOS only. |
| **Phase 2** — Android parity | +4-6 months | Same surface area on Android via Compose. Both targets passing the same test suite. |
| **Phase 3** — production polish | +6-12 months | Routing (`router-ios`/`router-android`), full theming + dark mode, animation primitives, accessibility, real apps shipping in production. |
| **Phase 4** — ecosystem | ongoing, years | Third-party native module bindings, platform-specific feature parity (push notifications, deep links, biometrics, payments), `@pyreon/native-cli` polish. |

**Realistic envelope**: **2-3 years to production-ready** iOS + Android with a focused team. Ecosystem parity with React Native takes ~5+ years. This is a strategic multi-year commitment, not an MVP.

The cost framing: if Pyreon's goal is to be **the framework that competes with React Native at a fundamental architectural level**, this is the investment. If it's just "expand the web framework's reach a bit," this is too expensive — pick Option C from the archived survey (JS-on-native bridge) instead, accept the RN-class constraints, ship in months.

---

## Risks + non-goals

### Real risks (specific, dated)

| Risk | Mitigation |
|---|---|
| **Compiler complexity blows up**: Swift's type system is rich (generics + protocols + opaque types); Kotlin's is similarly rich. TS → Swift/Kotlin type translation has edge cases. | Phase 0 spike focuses on type mapper. If type mapping doesn't reach "covers 90% of Pyreon's existing TS without manual annotations," reconsider scope. |
| **Per-platform widget bindings never finish**: there are hundreds of UIKit / Compose widgets. Building all bindings is years of work. | Same answer as every native framework: ship 10 essentials, grow on demand. Don't try to be complete. |
| **Compose / SwiftUI evolve faster than we keep up**: Apple ships SwiftUI improvements yearly; Google ships Compose updates monthly. PMTC has to track. | Treat SwiftUI / Compose as "supported version N". Pin to LTS-equivalent versions; bump on a planned cadence. |
| **TypeScript-only features lose fidelity in Swift/Kotlin output**: variance, conditional types, mapped types. | Type mapper documents what's supported; user code that uses unsupported constructs gets compiler errors at native-target builds. |
| **Apple's EU DMA-era runtime restrictions tighten further (2026+)**: Apple has been restricting dynamic-code behaviors. PMTC sidesteps this entirely (no JS), but might face other restrictions. | PMTC is already on the safe side — no dynamic code at all. Lowest risk profile. |
| **Compose Multiplatform overlaps**: JetBrains is building Compose Multiplatform (Kotlin → iOS + Android + Desktop + Web). Risk: it eats PMTC's strategic positioning. | Compose Multiplatform requires writing in Kotlin. PMTC's pitch is "write Pyreon JSX." Different audience. |
| **Skip overlaps**: Skip transpiles Kotlin ↔ Swift, deployable as a single codebase. Risk: it solves part of the same problem more cheaply. | Skip requires writing Kotlin OR Swift as the source. PMTC's source is Pyreon JSX. Different audience again. |

### Non-goals (explicit)

- **Match SwiftUI / Compose performance characteristics exactly**: the output IS SwiftUI / Compose code, so perf is whatever those engines deliver. No claims of being faster.
- **Replace SwiftUI / Compose**: PMTC emits code that USES SwiftUI / Compose; it doesn't compete with them. The strategic positioning is "write once, target both."
- **Support every UIKit / AndroidView widget on day 1**: bindings grow on demand.
- **Ship a custom rendering engine**: not building a Flutter-shaped engine. SwiftUI and Compose are the rendering layer.
- **Provide a JS escape hatch in native apps**: no JS engine ships in the binary. Native blocks (`<native:ios>` / `<native:android>`) cover platform-specific escapes; nothing else.
- **Solve hot reload at Vite-HMR polish on day 1**: dev experience is good enough (recompile on save) but not instant. Polishing it is a Phase-3 concern.

---

## Validation checkpoints

Three pass/fail criteria for the Phase 0 spike. If any fail, regroup before Phase 1.

| Checkpoint | Pass criterion |
|---|---|
| **Type mapper coverage** | At least 90% of existing Pyreon source compiles to Swift without manual annotations. (Measure: feed `@pyreon/ui-components` source to the type mapper; count `// pyreon-native-skip` annotations needed.) |
| **Signal → `@State` round-trip** | A signal modified in user code, propagated through a computed, observed by an effect, observed by a SwiftUI `View`, fires the SwiftUI re-render path. (Measure: counter app on iOS simulator with a manual `signal.set` from a button works.) |
| **Style fidelity** | A rocketstyle button rendered in iOS simulator looks visually identical to the same rocketstyle button rendered on web (modulo platform native conventions like cursor style). (Measure: side-by-side screenshot diff at <5% pixel difference.) |

Past Phase 0, additional checkpoints per phase. These three are the minimum bar for "PMTC is real."

---

## Open questions (to settle before Phase 0)

- **Compose Multiplatform vs separate iOS/Android emitters**: JetBrains' Compose Multiplatform can target both iOS and Android from one Kotlin codebase. Question: emit iOS as native Swift (more idiomatic but more compiler work) OR as Compose-Multiplatform-Kotlin (less idiomatic but less compiler work)? Default position: native Swift for iOS, Compose for Android — strongest "truly native" framing.
- **Reactivity runtime: map onto native primitives, or ship a Pyreon-runtime-in-Swift/Kotlin?**: Default position: map onto `@State` / `MutableState` directly. A runtime port might be needed for complex signal-graph cases (deep `computed` cascades) — defer to Phase 1.
- **Build tooling: extend `@pyreon/cli` or new `@pyreon/native-cli`?**: Default position: new `@pyreon/native-cli`, separate concerns, can ship independently. Web `@pyreon/cli` stays focused on Vite + dev server.
- **Source-map tooling**: how do we make Xcode breakpoints point at Pyreon source lines, not compiled Swift? Default position: Swift's existing source map support via `#sourceLocation(file:line:)` directives, emitted by the Pyreon compiler. Same idea for Kotlin via debug info.

---

## What this doc commits to

- **The direction is chosen**: PMTC. The previous multi-option survey is archived at [`archive/native-platforms-survey-2026-05.md`](archive/native-platforms-survey-2026-05.md) for context.
- **Not yet committed**: timeline, staffing, sequencing, or first phase kickoff. This doc says *which direction*, not *when we start*.
- **Next action**: when ready to begin, build the Phase 0 spike. The pass/fail criteria above define what "Phase 0 succeeded" means.
- **Until then**: keep the codebase native-friendly. Don't add DOM-coupling to `@pyreon/core` / `@pyreon/reactivity` / `@pyreon/compiler`. Don't lock the architecture against a future PMTC target. The audit in PR #787 ("Mount-loop closure hazards" subsection in CLAUDE.md) confirms current state is clean.

---

## Why this direction beats the alternatives surveyed previously

The previous survey (archived) ranked four options. Under "build from scratch if needed, take all the time, truly native" framing — the user's framing — the ranking inverts:

| | Truly native? | Same code? | Same styles? | Years to ship |
|---|---|---|---|---|
| Option A — RN bridge | (1) native widgets only — JS engine ships | yes | mostly | ~1 year |
| Option B — **PMTC (this doc)** | **(3) native widgets + native code + native idiom** | **yes** | **yes** | **~2-3 years** |
| Option C — signal-aware bridge | (1) — JS engine ships | yes | mostly | ~6-12 months |
| Option D — Skia / custom renderer | not native widgets — disqualified | yes | yes, but pixels | ~3+ years |

Where (1) = native widgets only; (2) = native widgets + native code; (3) = native widgets + native code + native idiom (indistinguishable from hand-written).

PMTC is more expensive than Option C — but it's the only option that earns "truly native" without compromise. The user's framing demands it.
