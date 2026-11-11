---
title: "One .tsx file. A website, an iPhone app and an Android app"
description: "Write a component once in TypeScript and get a web app, a SwiftUI app and a Jetpack Compose app, each built from its platform’s real UI toolkit. How to scaffold one, what compiles to native views, what stays on the web, and how we test it on simulators and emulators in CI."
date: 2027-01-19
slug: one-tsx-three-platforms
tags: [ios, android, typescript, compilers]
cover: /blog/covers/one-tsx-three-platforms.png
---

One file of TypeScript. A web app, an iOS app and an Android app, each built from its own platform's real UI toolkit. Here is the counter every new Pyreon multiplatform project starts with:

```tsx
// src/App.tsx, as scaffolded by @pyreon/create-multiplatform
import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'

export function App() {
  const count = signal(0)
  return (
    <Stack gap="md" align="center">
      <Text data-testid="count">{count}</Text>
      <Button data-testid="increment" onPress={() => count.set(count() + 1)}>Increment</Button>
    </Stack>
  )
}
```

On the web, Vite builds it against `@pyreon/runtime-dom`: a flex `<div>`, a `<span>` and a `<button>`, with fine-grained updates and no re-renders. Run the same file through `pyreon-native`, and this is the Swift it writes:

```swift
struct App: View {
  @State private var count: Int = 0
  var body: some View {
    VStack(alignment: .center, spacing: 12) {
      Text(verbatim: "\(count)").accessibilityIdentifier("count")
      Button("Increment") { count = count + 1 }.accessibilityIdentifier("increment")
    }
  }
}
```

And the Kotlin:

```kotlin
@Composable
fun App() {
  var count by remember { mutableStateOf(0L) }
  Column(verticalArrangement = Arrangement.spacedBy(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
    Text(text = "${count}", modifier = Modifier.testTag("count"))
    Button(onClick = { count = count + 1L }, modifier = Modifier.testTag("increment")) {
      Text("Increment")
    }
  }
}
```

(Both unedited compiler output, minus the import preamble and a one-line Kotlin helper.)

That is PMTC, the Pyreon Multi-Target Compiler. You write TypeScript and JSX against a small vocabulary of primitives, and the compiler writes ordinary SwiftUI and Jetpack Compose that Xcode and Gradle build like any other code. A signal becomes `@State` on iOS and `mutableStateOf` on Android. `data-testid` becomes an accessibility identifier and a test tag. Your screens are real platform views, so when Apple or Google restyle a toggle, your app gets the new one without a framework release.

This post walks through getting a project running, what compiles to native and what deliberately does not, and how we test on simulators and emulators. It is experimental, and we will be precise about what that means.

## From zero to three apps

```bash
npm create @pyreon/multiplatform@latest my-app
# or: npx @pyreon/create-multiplatform my-app
cd my-app
npm install

npm run dev             # web, Vite dev server
npm run build:ios       # src/App.tsx → ios/generated/App.swift
npm run build:android   # src/App.tsx → android/.../generated/App.kt
```

One trap: the unscoped `npx @pyreon/create-multiplatform` does not work, because `npx` resolves package names and the package is `@pyreon/create-multiplatform`. Already using the Pyreon CLI? `pyreon new --native` runs the same scaffolder.

The parts of the generated tree you will touch:

```text
my-app/
  src/App.tsx              # the one shared source
  src/entry-web.tsx        # web mount entry
  .pyreonlintrc.json       # enables the `portable` lint rules for src/
  .maestro/counter.yaml    # one end-to-end flow for both platforms
  AGENTS.md  CLAUDE.md  .mcp.json
  ios/project.yml          # xcodegen spec; a pre-build phase runs scripts/build-ios.sh
  ios/Sources/             # SwiftUI @main shell + deep-link forwarding
  ios/generated/           # PMTC output
  android/app/src/main/kotlin/.../MainActivity.kt
  android/app/src/main/kotlin/.../generated/   # PMTC output
  scripts/build-ios.sh  scripts/build-android.sh
```

The hand-written native shells are small and stay yours. The `generated/` folders belong to the compiler.

What you need installed:

| target | toolchain |
| --- | --- |
| web | Bun or Node 18+ |
| iOS | macOS, Xcode 15+, xcodegen (`brew install xcodegen`) |
| Android | JDK 17, the Android SDK, and `gradle` on `PATH` (no Gradle wrapper is generated) |

Start with the web target and add native later. Nothing in the web build needs Xcode or Gradle.

Deep links come built in. The URL scheme defaults to the project name (`my-app` becomes `myapp://`, or pick one with `--scheme`), and the host files forward inbound URLs to the router, so `xcrun simctl openurl booted "myapp://item/42"` opens `/item/42`.

> **One component. Three platforms. Each one drawn by its own native UI toolkit.**

## Three loops, from milliseconds to seconds

There is no JavaScript running on the device to hot-patch, so the native loop has three layers. Use the cheapest one that answers your question:

| layer | command | what it answers |
| --- | --- | --- |
| web | `npm run dev` | layout, logic, styling: most of the work, with state-preserving hot reload |
| compiler | `npx @pyreon/native-cli check --watch --source=src` | "will this run on the device?", in milliseconds, no device involved |
| device | `npx @pyreon/native-cli dev --target=ios` (or `android`) | native look and feel and device features: rebuild, reinstall, relaunch |

`pyreon-native dev` compiles your source in memory first and prints compiler problems before Xcode or Gradle even starts. If the emitted Swift or Kotlin did not change (a comment, whitespace, a web-only file), it skips the native build entirely. It is a rebuild loop, not hot reload, so in-memory state resets on each rebuild. The [native dev loop docs](/docs/native-dev-loop) measured about 31 seconds for a first run and about 3 seconds for a warm label edit, rebuild through relaunch, on an iOS simulator with the counter app. A bigger app compiles more Swift, so treat 3 seconds as a floor.

## What compiles to native, and what stays on the web

This is the part to understand before writing shared code: **PMTC compiles your component source. It does not transpile npm packages to Swift or Kotlin.** A package reaches iOS and Android when its reactive logic has a Swift/Kotlin runtime port that the compiler recognises. Anything bound to the DOM, a `<canvas>`, the CSSOM or a JavaScript rendering engine stays on the web, and no compiler flag changes that.

What lowers today:

- **The reactive core and the language around it.** `signal`, `computed` and `effect` (in a component body or at module scope), typed props, `<For>` and `<Show>`, `if` and ternaries, array and string methods, string-literal unions and TypeScript enums (to native enums), object types (to structs and data classes), `Date`, timers, `throw`/`try`/`catch`, and `JSON.parse` to a typed decode. [Last week's post](/blog/how-pmtc-turns-tsx-into-swiftui-and-compose) shows the compiler output for each.
- **The 22 canonical primitives** in `@pyreon/primitives`: `Stack`, `Inline`, `Layer`, `Scroll`, `Text`, `Heading`, `Image`, `Button`, `Press`, `Link`, `Field`, `Toggle`, `Select`, `Modal`, `Tabs`, `Split`, `Canvas` and the rest. Each one has a real DOM implementation on the web and real SwiftUI and Compose output natively. The newest two: `<Select>` (a menu `Picker` / `ExposedDropdownMenuBox`) and `<Field kind="date" | "time" | "datetime">` with `min`/`max`, on each platform's own date picker.
- **Logic packages with native ports:** `@pyreon/store`, `@pyreon/machine`, `@pyreon/state-tree`, `@pyreon/i18n`, `@pyreon/permissions`, `@pyreon/form`, `@pyreon/storage`, `@pyreon/flow`, the router, and `@pyreon/charts`, which draws to a native canvas through an engine generated into the runtimes.
- **A fixed set of device and utility hooks:** `useFetch`, `useOnline`, `useAppState`, `useClipboard`, `useColorScheme`, `useGeolocation`, `useHaptics`, `useShare`, and newer ones such as `usePrevious`, `useUpdateEffect`, `useDocumentVisibility`, `useReducedMotion`, `useKeyboard` and `useInfiniteQuery`. For anything outside that set, `useNativeModule('Name')` compiles to an instance of a Swift or Kotlin class that *you* write. Bluetooth or a vendor SDK is an app-level change, not a framework PR.

What stays on the web, and why:

| package | web-only part | what crosses to native |
| --- | --- | --- |
| `@pyreon/code` | the CodeMirror 6 editor (a DOM editor) | a WebView bridge (`@pyreon/code/webview`) |
| `@pyreon/dnd` | the page-wide drag monitor and OS file drops | `useSortable`, `useDraggable`, `useDroppable` |
| `@pyreon/table` | the TanStack-backed `useTable` | the dependency-free `createTableState` engine |
| `@pyreon/virtual` | DOM virtualisation | nothing needed: `<Scroll><For>` is already a `LazyVStack` / `LazyColumn` |
| `@pyreon/hotkeys` | the shortcut registry over DOM keyboard events | the `useHotkey` hook |
| `@pyreon/document` | pdfmake / docx / exceljs / pptxgenjs | build the file on a server, then fetch or share it |
| `@pyreon/unistyle` | responsive breakpoints and CSS-variable theming | compile-time tokens and size classes |

None of this is tribal knowledge. Every package manifest declares a `multiplatform.tier` with a rationale: `@pyreon/code` says `web-only` and names its WebView bridge, `@pyreon/store` says `service-backend` and explains what it lowers to. The docs and the MCP server read the same field.

**"Web-only" does not mean "absent on the phone."** The `<WebView>` primitive (WKWebView on iOS, Android WebView) hosts a web-only pane, such as a code editor or a diagram, with a two-way data bridge. That pane behaves like a web page and pays WebView startup cost, so it suits self-contained panes. Your navigation, forms, lists and layout belong in the native primitives.

## When the compiler says no, it says why

PMTC accepts a declarative subset of TypeScript, so what happens outside it matters most. Here is a component that works fine on the web:

```tsx
export function Totals() {
  const prices = signal([3, 4, 5])
  let total = 0
  for (const p of prices()) {
    total += p
  }
  return (
    <Stack>
      <Text>Total: {total}</Text>
      <div class="legacy">web-only markup</div>
    </Stack>
  )
}
```

`pyreon-native check` gives one named warning per construct and target (abridged):

```text
! Totals.tsx [swift] Component Totals: a top-level `for` statement has no native
  lowering and was DROPPED — … Move loops/switch into a helper function that takes
  parameters (they DO lower there) … compute values with array methods
  (`.map`/`.reduce`/`.filter`), or render conditionally/iteratively in JSX.
! Totals.tsx [swift] <div> is a DOM/SVG element with no native lowering … Use the
  shared vocabulary from `@pyreon/primitives` (Stack, Text, Image, …), keep web-only
  markup inside a `<Web>` branch.
(… the same two for [kotlin])
checked 1 file(s) [swift, kotlin] — 0 error(s), 4 warning(s)
```

The fix: `const total = computed(() => prices().reduce((a, b) => a + b, 0))`, and move the `<div>` into a `<Web>` branch. The scaffold also switches on the `portable` rule group of `@pyreon/lint` for `src/`, so your editor flags these before you run anything.

Zero warnings still is not the same as "it builds", and we learned that the hard way. While drafting this post in November, I gave a todo an id from `Date.now()`, typed `id: number`. `check` reported zero warnings. `check --typecheck`, which runs a real `swiftc -typecheck`, did not:

```text
todos = (todos + [Todo(id: (Date().timeIntervalSince1970 * 1000), text: draft)])
                           `- error: cannot convert value of type 'TimeInterval' (aka 'Double') to expected argument type 'Int'
```

A plain `number` field lowers to an integer, and a millisecond timestamp is a `Double` on iOS. That one is fixed now: since [#4147](https://github.com/pyreon/pyreon/pull/4147) the compiler converts a whole-valued `Double` stored into an integer field, and the same line emits `Todo(id: Int(Date().timeIntervalSince1970 * 1000), …)`, which type-checks. The lesson stands, though: in CI, run `check --typecheck`, not only `check`.

> **Write it once in TypeScript. Ship it fine-grained to the web, iOS and Android.**

## Tested on simulators and emulators, in CI

Swift that parses proves very little. We gate PMTC at several levels, and the multiplatform docs label every claim with the level it reached:

1. On every PR that touches the native surface, emitted Swift and Kotlin are type-checked against stubs that mirror the real SDK signatures.
2. The example apps (`native-todomvc`, `native-tasks`, `native-finance`, a router demo, a counter) build with real Xcode and Gradle.
3. The `native-device` workflow boots an iOS Simulator and an Android emulator and runs XCUITest and Compose UI tests against those apps. Among the things asserted there: a 10,000-row list, navigation and deep links, validated forms, and `useFetch` against a real HTTP fixture. Its two build jobs are required checks on every PR that touches the native pipeline.

Device runs keep catching bugs a type-checker cannot. One from the docs: `<Modal>` once anchored its SwiftUI `.sheet` to `EmptyView()`. That is valid, type-checked Swift that never presents a sheet. Only a test on a simulator could see it, and now one does.

For **your** app, the scaffold sets up [Maestro](https://maestro.dev). Because `data-testid` lowers to the native id on both platforms, one YAML flow drives both:

```yaml
# .maestro/counter.yaml
appId: com.example.MyApp
---
- launchApp:
    clearState: true
- assertVisible:
    id: count
    text: "0"
- tapOn:
    id: increment
- tapOn:
    id: increment
- assertVisible:
    id: count
    text: "2"
```

```bash
npm run e2e:ios        # pyreon-native dev --target=ios --once && maestro test .maestro
npm run e2e:android
```

To be exact about scope: that scaffolded flow was run with Maestro on an iOS 18.5 simulator and an API 35 emulator. It has not been run on CI runners, physical devices or Maestro Cloud. The [native E2E docs](/docs/native-e2e-testing) say the same.

## What is not done yet

- **PMTC is experimental, and Pyreon is pre-1.0.** The docs call the native targets demo-quality, not production-ready. They also keep a weighted capability matrix, gated in CI, of what is asserted on a device versus what only emits and type-checks. Read the current headline there rather than trusting a number in a blog post.
- **No hot reload on device**, and native compiler errors point at the generated file. Each generated file starts with a `// pyreon-source:` comment naming the `.tsx` it came from.
- **Simulators and emulators** in the dev loop. A physical device needs signing, which belongs to the release path.
- **Routes are declared in code on native**, with `createRouter({ routes: [...] })`.
- **"It compiled on the web" tells you nothing about native.** Mutations, streams and anything DOM-bound: check the package's tier and the docs.
- **A narrow subset.** If your code leans on imperative loops in component bodies, classes, or generics in logic, expect named warnings and some restructuring.

Weighing PMTC against Expo, Flutter or Capacitor? We wrote down [when each one is the better pick](/docs/compare-app-frameworks), including the cases where it is not us.

## Build something with it

The fastest way to judge all of this is to scaffold a project, run `npx @pyreon/native-cli check --typecheck --source=src` on one of your own components, and read what it says.

```bash
npm create @pyreon/multiplatform@latest
```

- Docs: [Create a multiplatform app](/docs/create-multiplatform) (toolchains, deep links, release builds) and [how PMTC works](/docs/multiplatform)
- Star the repo: [github.com/pyreon/pyreon](https://github.com/pyreon/pyreon)
- Talk to us on [Discord](https://pyreon.dev/discord) or open an issue on [GitHub](https://github.com/pyreon/pyreon/issues). If something you expected to lower does not, paste the warning text: named warnings exist so bug reports can be specific.
