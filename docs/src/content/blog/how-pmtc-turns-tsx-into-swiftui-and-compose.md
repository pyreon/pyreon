---
title: "How PMTC turns TSX into SwiftUI and Jetpack Compose"
description: "Pyreon's multi-target compiler writes Swift and Kotlin source you can read. What a signal becomes, how a union type becomes an enum, why .length turns into utf16.count, what landed this winter (Date, enums, timers, effects, try/catch, JSON.parse), and how the output is checked all the way to a device."
date: 2027-01-11
slug: how-pmtc-turns-tsx-into-swiftui-and-compose
tags: [swift, kotlin, compilers, typescript]
cover: /blog/covers/how-pmtc-turns-tsx-into-swiftui-and-compose.png
---

One line of TypeScript from our TodoMVC example:

```tsx
if (text.length === 0) return
```

And the Swift our compiler writes for it:

```swift
if text.utf16.count == 0 {
  return
}
```

Why `utf16.count` and not `count`? A JavaScript string's `length` counts UTF-16 code units. Swift's `String.count` counts grapheme clusters, so the moment a user types an emoji or an accented letter, the two give different answers. The compiler picks the one that matches what your web build already does. (Kotlin's `String.length` already counts UTF-16 units, so Android gets `text.length`.)

That one decision is PMTC, the Pyreon Multi-Target Compiler, in miniature: take a component written for the web and produce Swift and Kotlin that behave the same way, in each platform's own UI toolkit. Here is how it does it, with real compiler output, and where it stops.

## Source code in, source code out

`@pyreon/native-compiler` reads `.tsx` and writes SwiftUI and Jetpack Compose **source files**. Xcode and Gradle compile them like any other Swift or Kotlin in your project. A `<Stack>` becomes a `VStack` or a `Column`. A `<Field>` becomes a `TextField`. Your UI runs as native views, with no JavaScript engine and no bridge between a JS thread and the screen.

The generated code links against two small runtime packages, `@pyreon/native-runtime-swift` and `@pyreon/native-runtime-kotlin` (plus the router ports), which supply what SwiftUI and Compose do not ship on their own: persistent storage wrappers, timers, a date field, a JSON decoder with JavaScript's semantics.

What PMTC compiles is a **subset**, on purpose:

- your component source,
- the 22 canonical primitives from `@pyreon/primitives` (`Stack`, `Inline`, `Text`, `Button`, `Field`, `Toggle`, `Select`, `Scroll`, `Modal`, …),
- the reactive core,
- and the hooks and library APIs whose packages ship a native runtime.

It does not transpile npm packages. Code that needs the DOM, a `<canvas>` or a JavaScript rendering engine stays on the web, by design. When you want a rich web pane on a phone (a code editor, a flow diagram), the `<WebView>` primitive hosts it with a two-way data bridge. That pane is a WebView, with a WebView's startup cost, and the docs say so plainly.

## The input: one file, three targets

The TodoMVC reference is a single file, `examples/native-todomvc-ios/src/TodoApp.tsx`. The web, iOS and Android builds all read it unchanged. Trimmed:

```tsx
import { state, derived, signalOf } from '@pyreon/core/plain'
import { useStorage } from '@pyreon/storage'
import { For, Show } from '@pyreon/core'
import { Stack, Inline, Text, Button, Field, Toggle } from '@pyreon/primitives'

type Todo = { id: number; text: string; done: boolean }
type Filter = 'all' | 'active' | 'completed'

export function TodoApp() {
  const todos = useStorage<Todo[]>('pyreon-todomvc:todos', [])
  let filter = state<Filter>('all')
  let draft = state<string>('')

  const remaining = derived(() => todos().filter(t => !t.done).length)

  const toggle = (id: number) => {
    todos.set(todos().map(t => t.id === id ? { ...t, done: !t.done } : t))
  }
  // addTodo, remove, clearCompleted, visible ...

  return (
    <Stack gap={2} data-testid="todo-app">
      <Field
        value={signalOf<typeof draft>(draft)}
        onChangeText={(t) => { draft = t }}
        onSubmit={addTodo}
        placeholder="What needs to be done?"
        data-testid="new-todo"
      />
      {/* <TransitionGroup><For each={…visible} by={(t) => t.id}>…</For></TransitionGroup> */}
      <Inline gap={2} align="center">
        <Text>{remaining} remaining</Text>
        {/* filter buttons */}
        <Show when={signalOf<typeof hasCompleted>(hasCompleted)}>
          <Button onPress={clearCompleted}>Clear completed</Button>
        </Show>
      </Inline>
    </Stack>
  )
}
```

It is written in [Plain Mode](/docs/plain-mode) (`let filter = state('all')`, plain assignments instead of `.set()`), a compile-time dialect. After a pre-pass, the web compiler and PMTC both see ordinary signal code, and the explicit `signal()` API lowers exactly the same way.

## The output: Swift you would write by hand

`packages/native/compiler/src/tests/todomvc-baseline.test.ts` compiles that file and compares the Swift against an inline snapshot, so any drift in either direction fails CI. Here is that output, trimmed to the parts we look at below:

```swift
enum Filter: String, Codable {
  case all, active, completed
}

struct Todo: Codable {
  var id: Int
  var text: String
  var done: Bool
}

struct TodoApp: View {
  @PyreonAppStorage("pyreon-todomvc:todos") private var todos: [Todo] = []
  @State private var filter: Filter = .all
  @State private var draft: String = ""
  private var remaining: Int { todos.filter({ t in !t.done }).count }
  private var hasCompleted: Bool { todos.contains(where: { t in t.done }) }
  private func addTodo() {
    let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    if text.utf16.count == 0 {
      return
    }
    let maxId = todos.reduce(0, { m, t in (t.id > m ? t.id : m) })
    todos = (todos + [Todo(id: maxId + 1, text: text, done: false)])
    draft = ""
  }
  private func toggle(_ id: Int) {
    todos = todos.map({ t in t.id == id ? { var c = t; c.done = !t.done; return c }() : t })
  }
  var body: some View {
    VStack(spacing: 8) {
      TextField("What needs to be done?", text: $draft)
        .onSubmit { addTodo() }.accessibilityIdentifier("new-todo")
      VStack {
        ForEach(visible, id: \.id) { t in
          TodoRow(todo: t, onToggle: { toggle(t.id) }, onRemove: { remove(t.id) })
        }
      }
      .animation(.default, value: visible.count)
      HStack(alignment: .center, spacing: 8) {
        Text(verbatim: "\(remaining) remaining")
        Button("All") { filter = .all }
        // Active, Completed ...
        if hasCompleted {
          Button("Clear completed") { clearCompleted() }
        }
      }
    }.accessibilityElement(children: .contain).accessibilityIdentifier("todo-app")
  }
}
```

And the Kotlin for the same file, from the same compiler (trimmed the same way):

```kotlin
enum class Filter { all, active, completed }

@Serializable
data class Todo(var id: Long, var text: String, var done: Boolean)

@Composable
fun TodoApp() {
  var todos by rememberPyreonStorage<List<Todo>>("pyreon-todomvc:todos", listOf())
  var filter by remember { mutableStateOf(Filter.all) }
  var draft by remember { mutableStateOf("") }
  val remaining by remember { derivedStateOf { todos.filter({ t -> !t.done }).length } }
  fun toggle(id: Long) {
    todos = todos.map({ t -> if (t.id == id) t.copy(done = !t.done) else t })
  }
  Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.testTag("todo-app")) {
    TextField(value = draft, onValueChange = { t -> draft = t }, placeholder = { Text("What needs to be done?") }, singleLine = true, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = { addTodo() }), modifier = Modifier.testTag("new-todo"))
    Column(modifier = Modifier.animateContentSize()) {
      LazyColumn {
        items(visible, key = { it.id }) { t ->
          TodoRow(todo = t, onToggle = { toggle(t.id) }, onRemove = { remove(t.id) })
        }
      }
    }
    // Row with the counter, filter buttons and "Clear completed" ...
  }
}
```

## The mapping, construct by construct

Put the two outputs side by side and the rules fall out. None of this is string templating. Each row is a decision about what the platform's own idiom is.

| TypeScript / Pyreon | SwiftUI | Compose |
| --- | --- | --- |
| `state(x)` / `signal(x)` in a component | `@State private var` | `var x by remember { mutableStateOf(...) }` |
| `derived(...)` / `computed(...)` | computed property `private var x: T { ... }` | `val x by remember { derivedStateOf { ... } }` |
| `type Filter = 'a' \| 'b'` | `enum Filter: String, Codable` | `enum class Filter` |
| `type Todo = { ... }` | `struct Todo: Codable` | `@Serializable data class Todo` |
| `{ ...t, done: !t.done }` | `{ var c = t; c.done = !t.done; return c }()` | `t.copy(done = !t.done)` |
| `<Stack gap={2}>` | `VStack(spacing: 8)` | `Column(verticalArrangement = Arrangement.spacedBy(8.dp))` |
| `<Field value onChangeText onSubmit>` | `TextField(..., text: $draft).onSubmit { }` | `TextField(value, onValueChange)` + `KeyboardActions(onDone)` |
| `<For each by>` | `ForEach(xs, id: \.id)` | `LazyColumn { items(xs, key = { it.id }) }` |
| `<Show when>` | `if cond { ... }` | `if (cond) { ... }` |
| `data-testid="x"` | `.accessibilityIdentifier("x")` | `Modifier.testTag("x")` |
| `useStorage<Todo[]>` | `@PyreonAppStorage` (runtime) | `rememberPyreonStorage` (runtime) |
| `useStorage<string>` | `@AppStorage` | `rememberSaveable { mutableStateOf(...) }` |

Four of these are worth a closer look.

**Object spread.** Swift has no `{ ...t, done: true }` for a struct. The emitter recognises the shape "one spread, then overridden fields" and writes an immediately invoked closure that copies the value and changes the copy. Kotlin data classes already have `.copy(field = value)`, which is the same operation, so Android gets the one-liner.

**Two-way binding.** On the web, `<Field value onChangeText>` is an input plus a handler. SwiftUI's `TextField` wants a `Binding`, so when `value` is a signal in scope the emitter writes `$draft`, Swift's binding projection. Compose wants `value` plus `onValueChange`, so your handler is threaded through as you wrote it, parameter name and all (`{ t -> draft = t }`). `onSubmit` becomes `.onSubmit` on iOS and an IME "Done" action on Android.

**Storage.** `useStorage` with a type `@AppStorage` can hold natively (strings, numbers, booleans) emits `@AppStorage` directly. An array of structs needs a JSON round-trip through `Data`, which used to be 14 lines of emitted boilerplate. Today it is one property wrapper in the Swift runtime, `@PyreonAppStorage`, and the baseline test asserts that the old boilerplate (`JSONDecoder`, `JSONEncoder`, `nonmutating set`) never comes back.

**Numbers.** TypeScript has one `number`. Swift and Kotlin have several. A plain `number` field lowers to an integer (`Int` on iOS, `Long` on Android): right for ids and counts, wrong for prices. Fractional values use a cross-target alias, `type Double = number`, which the compiler reads as the native `Double`. Since November, a whole-valued `Double` stored into an integer field is converted for you instead of failing the Swift build ([#4147](https://github.com/pyreon/pyreon/pull/4147)).

## New this winter: the everyday TypeScript that now lowers

The fastest way to grow a compiler like this is to compile real app code and lower whatever it trips on. In the past few weeks that closed a run of shapes almost every app writes. Here is one component that uses most of them:

```tsx
import { signal, computed, effect } from '@pyreon/reactivity'
import { onMount } from '@pyreon/core'
import { Stack, Text, Button } from '@pyreon/primitives'

enum Mode { Focus = 'focus', Break = 'break' }
type Saved = { minutes: number }

const sessions = signal(0)
const label = computed(() => `${sessions()} sessions today`)

export function FocusTimer() {
  const seconds = signal(0)
  const mode = signal(Mode.Focus)
  const problem = signal('')

  effect(() => {
    if (seconds() >= 1500) mode.set(Mode.Break)
  })

  onMount(() => {
    const id = setInterval(() => seconds.set(seconds() + 1), 1000)
    return () => clearInterval(id)
  })

  const restore = (raw: string) => {
    try {
      const saved = JSON.parse(raw) as Saved
      seconds.set(saved.minutes * 60)
    } catch {
      problem.set('Saved session is unreadable')
    }
  }

  return (
    <Stack gap="md">
      <Text>{label}</Text>
      <Text>{seconds} s</Text>
      <Button onPress={() => restore('{"minutes":5}')}>Restore</Button>
    </Stack>
  )
}
```

Zero warnings on both targets. The Swift, trimmed:

```swift
enum Mode: String, Codable {
  case focus, `break` = "break"
}

@available(iOS 17.0, macOS 14.0, *)
@Observable
final class PyreonModuleState {
    static let shared = PyreonModuleState()
    var sessions: Int = 0
    var label: String { "\(PyreonModuleState.shared.sessions) sessions today" }
    private init() {}
}

struct FocusTimer: View {
  @State private var seconds: Int = 0
  @State private var mode: String = "focus"
  @State private var problem: String = ""
  private func __pyEffect0() {
    if seconds >= 1500 {
      mode = "break"
    }
  }
  private func __pyEffect1() -> (() -> Void)? {
    let id = PyreonTimers.setInterval(1000, { seconds = seconds + 1 })
    return { PyreonTimers.clear(id) }
  }
  private func restore(_ raw: String) {
    do {
      let saved = (try PyreonJSON.parse(Saved.self, raw))
      seconds = saved.minutes * 60
    } catch {
      problem = "Saved session is unreadable"
    }
  }
  var body: some View {
    ZStack {
      VStack(spacing: 12) {
        Text(verbatim: "\(PyreonModuleState.shared.label)")
        Text(verbatim: "\(seconds) s")
        Button("Restore") { restore("{\"minutes\":5}") }
      }
    }
      .onAppear { __pyEffect0() }
      .onChange(of: seconds) { __pyEffect0() }
      .onAppear { __pyEffect1Run() }
      .onDisappear { __pyEffect1Cleanup?(); __pyEffect1Cleanup = nil }
  }
}
```

What happened there:

- **Module-scope `signal()` and `computed()`** become one per-file singleton: an `@Observable` class on iOS, an `object` with `mutableStateOf` on Android. Every screen in the file shares it.
- **`effect()` in a component body** becomes a function that runs on appear and again whenever a signal it reads changes: `.onChange(of: seconds)` on iOS, `DisposableEffect(seconds)` on Android. The compiler works out the dependency list for you, so you still never write one.
- **`setInterval` / `setTimeout`** lower to a small `PyreonTimers` runtime with the web's contract: callbacks on the main thread, ids never reused, clearing an unknown id is a no-op. The cleanup your `onMount` returns runs on disappear.
- **`throw`, `try`, `catch` and `finally`** lower to Swift `do`/`catch` and Kotlin `try`/`catch`/`finally`.
- **`JSON.parse(raw) as Saved`** becomes a typed, throwing decode into the generated struct (`PyreonJSON.parse(Saved.self, raw)` / `PyreonJson.parse<Saved>(raw)`). A schema's `.parse(x)` lowers the same way, as a throwing native call.
- **TypeScript `enum`s** become native enums (`enum Mode: String` / `enum class Mode`), and a signal holding one stores its raw value.
- **JavaScript `Date`** lowers too: natively, a date is its epoch milliseconds, so `Date.now()` and `new Date(ms)` work, and formatting goes through `Intl.DateTimeFormat`.

The hooks list grew as well: `usePrevious`, `useUpdateEffect`, `useLatest`, `useDocumentVisibility`, `useReducedMotion`, `useKeyboard`, `useMediaQuery` (for `prefers-color-scheme`), and `useInfiniteQuery` from `@pyreon/query`. Two new primitives landed with them: `<Select>` (a SwiftUI menu `Picker` on iOS, an `ExposedDropdownMenuBox` on Android) and `<Field kind="date" | "time" | "datetime">` with `min`/`max`, rendered with each platform's own date picker.

## Libraries bring their own lowering

The compiler package knows nothing about `@pyreon/query`, `@pyreon/charts` or `@pyreon/flow`. Each library that supports native ships its own compiler plugin under `src/native-plugin/` in its own package, and the native CLI loads plugins from the dependencies your app declares. Library-specific emit lives next to the library's code.

That design has one visible failure mode, and the compiler names it. Forget to declare the package and you get this (from `pyreon-native check` on the TodoMVC source, November 2026):

```text
useStorage (from @pyreon/storage) has NO native lowering in this compile: @pyreon/storage
lowers through its own native compiler plugin, and that plugin is not loaded, so the imports
are reproduced verbatim and the native build fails with "cannot find 'useStorage' in scope".
Declare @pyreon/storage in the app's package.json dependencies (the native CLI loads plugins
only from declared dependencies), or pass its plugin to createCompiler({ plugins }).
```

## A compiler that tells you when it stops

The supported TypeScript in a component body is deliberately narrow: signal, computed and effect declarations, typed props, the primitives, `<For>` and `<Show>`, `if` and ternaries, array and string methods, `type` aliases and enums, plus a growing slice of the standard library (`Map`, `Set`, `Date`, `Intl` formatting, `JSON.parse`, timers, `throw` and `try/catch`).

The design rule for everything outside that lane: **say so, by name.** Early on, unsupported code was often dropped silently, the worst thing a compiler can do, because the app builds and then behaves differently. A large share of this year's native work turned silent drops into named warnings or into real lowerings. The docs now say the failure mode outside the lane is "almost always" a named warning, and they list the known silent shapes instead of pretending there are none. You can see a few of those warnings in action in next week's launch post.

A clean compile is not yet proof that the output compiles, either. `pyreon-native check` reports warnings in milliseconds. `pyreon-native check --typecheck` also runs a real `swiftc -typecheck` against the SwiftUI SDK on macOS. Put the second one in CI, next to the Gradle build for Android.

## Five rungs from emit to device

We grade native evidence in rungs, and the multiplatform docs credit each capability only at the rung it has reached:

| rung | what it proves | where it runs |
| --- | --- | --- |
| R1 emit | the compiler produces this code | inline snapshots such as `todomvc-baseline.test.ts` |
| R2 typecheck | `swiftc` and `kotlinc` accept it | every PR that touches the native surface, against stubs that mirror the real SDK signatures |
| R3 unit | the Swift and Kotlin runtimes behave | runtime package tests |
| R4 local device | builds and runs on a simulator or emulator | a developer machine |
| R5 device gate | behaviour asserted on a simulator and an emulator in CI | `native-device.yml` |

`native-device.yml` builds the example apps with real Xcode and Gradle, then runs XCUITest on an iOS Simulator and Compose instrumented tests on an Android emulator, plus a lane that re-runs the Android assertions against an R8-minified release build. It runs on pull requests that touch the native pipeline and nightly against `main`. Its two build jobs, "iOS — xcodebuild (Simulator SDK)" and "Android — gradlew assembleDebug", became required checks only after a scripted streak gate saw 14 green nightlies in a row. As of 10 November 2026 the example apps carry 88 XCUITest methods and 99 Compose instrumented tests between them.

Why all this ceremony? Because compiling is cheap evidence. An early Android storage implementation passed its build and its tests while quietly defaulting to an in-memory map, so nothing survived a process restart. The same class showed up on iOS, where a `<Modal>` anchored its `.sheet` to `EmptyView()`: valid, type-checked Swift that never presents anything. Only assertions of the user-visible result, on a device, caught them. Both are fixed, and both are why the rungs exist.

## Where it stops today

- **Experimental.** The native targets are the youngest part of Pyreon, which is pre-1.0. The docs call PMTC demo-quality, not production-ready, and we agree.
- **A subset of TypeScript.** Classes, generic logic and arbitrary npm imports do not lower. You write shared components in the supported subset, or reach for an escape hatch: `<NativeIOS>`, `<NativeAndroid>` and `<Web>` branches, or `useNativeModule` for a Swift or Kotlin class you write yourself.
- **DOM-bound packages keep their DOM half on the web.** The CodeMirror editor, TanStack-backed tables, DOM virtualisation and the document exporters need the DOM. Several of these packages now lower a part of their API (sortable drag and drop, the table state engine, the `useHotkey` hook), and the editors can sit in a WebView, but the DOM half never renders as native views.
- **Weak rows in the capability matrix.** The multiplatform docs keep a weighted, CI-gated table of what is device-asserted. Payments has no device test yet, crash reporting and release/distribution are partial, and offline sync is web-only beyond its offline-first half.
- **Errors arrive in Swift and Kotlin terms.** A native build error points at the generated file. Each generated file starts with a `// pyreon-source:` comment naming the `.tsx` it came from, and mapping errors back to your line is on the roadmap.

## Build something with it

Scaffold a project, compile one of your simpler screens, and read what PMTC writes:

```bash
npm create @pyreon/multiplatform@latest
```

- Docs: [How PMTC works, with the full supported-TypeScript reference](/docs/multiplatform), and [the primitives](/docs/primitives)
- Star the repo: [github.com/pyreon/pyreon](https://github.com/pyreon/pyreon)
- Talk to us on Discord{/* DISCORD-INVITE: link the permanent invite here once it exists */} or open an issue on [GitHub](https://github.com/pyreon/pyreon/issues). If something you expected to lower does not, paste the warning: named warnings exist so bug reports can be specific.
