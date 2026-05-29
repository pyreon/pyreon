# PMTC TodoMVC walkthrough — does the structural mapping hold at real-app scale?

**Status**: Companion to [`native-platforms.md`](./native-platforms.md) (PMTC strategic direction, merged in #764) and PR #794 (compiler skeleton — 7 isolated fixtures × 2 emitters with snapshot tests). This doc validates the PMTC structural-mapping table from the plan AGAINST a real (canonical) TodoMVC implementation, identifying every spot where the mapping breaks down, needs special handling, or requires a Pyreon-side abstraction the plan hasn't named yet.

**Why TodoMVC**: it's the canonical "non-trivial but not contrived" app. Exercises 8 distinct Pyreon constructs that the 7 fixture tests don't combine:

- Multi-field form input + keyboard submit
- Array mutation idioms (`signal<T[]>` with append/remove/update)
- Per-item state (toggle done, edit)
- Filter state as discriminated union
- `computed` depending on multiple signals
- Conditional styling via rocketstyle dimensions
- `effect` for persistence (`@pyreon/storage` → `UserDefaults` / `SharedPreferences`)
- Reactive count display + "clear completed" mutation

**TL;DR — does the mapping hold?**

Mostly yes, with **8 named breakage points** that require either compiler special-cases or new Pyreon-side abstractions before Phase 1 can ship TodoMVC. None are fatal; all are foreseeable. The PMTC plan's mapping table covers the 80% case; this walkthrough surfaces the missing 20%.

**Update 2026-05-21 — closure status**: All 5 in-compiler closable named gaps are CLOSED on main. **G6 #835** (string-literal union → native enum) → **G1 #842** (TextField two-way binding) → **G2 #844** (onKeyDown=Enter → `.onSubmit`/`keyboardActions`; cascade-merged **G4 #846** for object partial-update via `var c = t; c.k = v` IIFE / `t.copy(k = v)`) → **G5 #849** (`useStorage` → `@AppStorage`/`rememberSaveable`). The TodoMVC baseline test in `packages/native/compiler/src/tests/todomvc-baseline.test.ts` has gone from 7 `it.todo` to 0 — full named-gap closure of the closable scope. **G3 is a SEMANTIC CHOICE** (decided below: Option A "immutable spread" for Phase 1, Option B "native mutation" opt-in for Phase 2). **G7/G8** are Phase 3 work (rocketstyle conditional + router URL-hash). See the bottom-of-doc status table for current per-gap state.

The 8 breakage points (full detail per section below):

1. **TextField two-way binding emission** — Pyreon's one-way `value + onInput` idiom needs special-case emission to Swift's `TextField("...", text: $text)` two-way binding. Kotlin's `TextField(value = ..., onValueChange = ...)` matches Pyreon directly. **Compiler change needed: detect `<input>` + matched-signal pattern, emit `$text`-binding shape on Swift.**
2. **Keyboard event handling** — Pyreon `onKeyDown={e => e.key === 'Enter' && ...}` doesn't translate cleanly. SwiftUI uses `.onSubmit { ... }`; Compose uses `keyboardActions = KeyboardActions(onDone = ...)`. **Compiler change needed: pattern-match on `e.key === 'Enter'` and emit the platform-idiomatic submit handler.**
3. **Array mutation idioms** — `todos.set([...todos(), newTodo])` is the JS-immutable idiom. Swift's `@State var todos: [Todo]` accepts `todos.append(newTodo)` and triggers re-render via SwiftUI's value-semantics tracking. Kotlin needs `mutableStateListOf<Todo>()` for fine-grained list reactivity (not `mutableStateOf(listOf())` per the current PR #794 fixture, which works but re-renders the entire list on every change). **Compiler choice needed: emit immutable spread (matches Pyreon source 1:1, suboptimal perf) OR emit native mutation (idiomatic + faster, semantic gap with source).**
4. **Object-in-array partial updates** — `todos.set(todos().map(t => t.id === id ? { ...t, done: !t.done } : t))` is idiomatic Pyreon. Both Swift and Kotlin support more direct mutation (`todos[index].done.toggle()` on `mutableStateListOf`). **Same trade-off as #3 — fidelity to source vs platform idiom.**
5. **`@pyreon/storage` cross-platform abstraction** — `useStorage('todos', [])` is a Pyreon-package concept that maps to `localStorage` on web, `UserDefaults` on iOS, `SharedPreferences` on Android. **The PMTC plan named this pattern ("per-platform abstraction layer") but didn't specify the package shape.** This walkthrough proposes a concrete `@pyreon/storage` / `@pyreon/storage-ios` / `@pyreon/storage-android` split with the compiler picking the right binding per target.
6. **Filter discriminated union** — `signal<'all' | 'active' | 'completed'>('all')` maps cleanly to Swift `enum Filter` / Kotlin `enum class Filter`. **Compiler change needed: detect string-literal-union signal types and emit native enums (currently the compiler emits raw `String` — see PR #794's parse.ts).**
7. **rocketstyle conditional theming per item state** — `<TodoItem state={todo.done ? 'completed' : 'active'}>` works in principle (per PR 7c in the Phase 0 roadmap), but **the conditional dimension expression needs careful emission**: SwiftUI wants `.modifier(TodoItemModifier(state: todo.done ? .completed : .active))`, NOT a dynamically-recomputed expression in the body. **Compiler change needed: hoist conditional dimension expressions out of `body` into the `.modifier(...)` call site.**
8. **`@pyreon/router` URL-hash filter sync** — the canonical TodoMVC uses URL hashes (`#/`, `#/active`, `#/completed`) for filter state. On web this is natural; on iOS/Android there's no URL bar. **The PMTC plan named `@pyreon/router-ios` / `@pyreon/router-android` as Phase 3 work.** For TodoMVC this means: Phase 0/1 can use signal-based filter state (no URL sync); Phase 3 wires URL sync back via the router packages.

The rest of the doc walks through each section of TodoMVC with the source, the Swift emit, the Kotlin emit, and the gap (if any).

---

## The Pyreon TodoMVC source

The full app in one file — what every other section dissects:

```tsx
// TodoApp.tsx
import { signal, computed, effect } from '@pyreon/reactivity'
import { useStorage } from '@pyreon/storage'

type Todo = { id: number; text: string; done: boolean }
type Filter = 'all' | 'active' | 'completed'

let nextId = 1

export function TodoApp() {
  const todos = useStorage<Todo[]>('pyreon-todomvc:todos', [])
  const filter = signal<Filter>('all')
  const draft = signal<string>('')

  const visible = computed(() => {
    const xs = todos()
    if (filter() === 'active') return xs.filter((t) => !t.done)
    if (filter() === 'completed') return xs.filter((t) => t.done)
    return xs
  })

  const remaining = computed(() => todos().filter((t) => !t.done).length)
  const hasCompleted = computed(() => todos().some((t) => t.done))

  const addTodo = () => {
    const text = draft().trim()
    if (text.length === 0) return
    todos.set([...todos(), { id: nextId++, text, done: false }])
    draft.set('')
  }

  const toggle = (id: number) => {
    todos.set(todos().map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
  }

  const remove = (id: number) => {
    todos.set(todos().filter((t) => t.id !== id))
  }

  const clearCompleted = () => {
    todos.set(todos().filter((t) => !t.done))
  }

  return (
    <VStack>
      <TextField
        value={draft}
        onInput={(e) => draft.set(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && addTodo()}
        placeholder="What needs to be done?"
      />

      <For each={visible} by={(t) => t.id}>
        {(t) => <TodoRow todo={t} onToggle={() => toggle(t.id)} onRemove={() => remove(t.id)} />}
      </For>

      <HStack>
        <Text>{() => `${remaining()} items left`}</Text>
        <Button onClick={() => filter.set('all')}>All</Button>
        <Button onClick={() => filter.set('active')}>Active</Button>
        <Button onClick={() => filter.set('completed')}>Completed</Button>
        <Show when={hasCompleted}>
          <Button onClick={clearCompleted}>Clear completed</Button>
        </Show>
      </HStack>
    </VStack>
  )
}

function TodoRow(props: { todo: Todo; onToggle: () => void; onRemove: () => void }) {
  return (
    <HStack state={props.todo.done ? 'completed' : 'active'}>
      <Checkbox checked={props.todo.done} onChange={props.onToggle} />
      <Text>{props.todo.text}</Text>
      <Button onClick={props.onRemove}>×</Button>
    </HStack>
  )
}
```

This file uses 11 Pyreon constructs: `signal`, `computed`, `effect` (implicit via `useStorage`), `useStorage`, `<TextField>`, `<For>`, `<Show>`, `<Checkbox>`, conditional rocketstyle dimension, event handlers (onClick, onInput, onChange, onKeyDown), and discriminated-union state. The 7 fixture tests in PR #794 cover 5 of these (`signal`, `computed`, `<For>`, `<Show>`, `onClick`). The walkthrough below covers the gaps.

---

## Section 1 — data model: `Todo` interface

### Pyreon source

```tsx
type Todo = { id: number; text: string; done: boolean }
```

### Expected Swift emit

```swift
struct Todo: Identifiable, Equatable {
  let id: Int
  var text: String
  var done: Bool
}
```

### Expected Kotlin emit

```kotlin
data class Todo(
  val id: Int,
  val text: String,
  val done: Boolean,
)
```

### Mapping notes

- Swift adds `Identifiable` automatically — `<For by={t => t.id}>` requires it on iOS (SwiftUI's `ForEach` keys on `Identifiable.id`).
- Swift adds `Equatable` automatically — needed for the `==` checks in `.map`/`.filter` callbacks AND for SwiftUI's diff-based re-render detection.
- Kotlin's `data class` gets `equals`/`hashCode` automatically — needed for the same diff detection.
- TS `type` vs `interface` — both map to the same target. TS `interface Todo extends ...` would need additional Swift protocol-conformance / Kotlin sealed-class handling; PR #794 fixtures use only TS `type` literals.

### Compiler change required

**None new**. PR #794's fixture 6 already emits a generated `TodoListItem` struct from the inline TS type. Extending to handle top-level `type` declarations + automatic `Identifiable`/`Equatable` derivation is a small extension. The PR 5d (union types) work in the Phase 0 roadmap handles discriminated unions but standalone `type` aliases are simpler.

### Gap

None. ✅

---

## Section 2 — `useStorage` cross-platform persistence

### Pyreon source

```tsx
const todos = useStorage<Todo[]>('pyreon-todomvc:todos', [])
```

### Expected Swift emit

```swift
@AppStorage("pyreon-todomvc:todos") private var todosData: Data = Data()
private var todos: [Todo] {
  get { (try? JSONDecoder().decode([Todo].self, from: todosData)) ?? [] }
  set { todosData = (try? JSONEncoder().encode(newValue)) ?? Data() }
}
```

**OR** (cleaner — requires `Todo` to be `Codable`):

```swift
// emitted at module scope
extension Todo: Codable {}

// emitted in struct
@AppStorage("pyreon-todomvc:todos") private var todos: [Todo] = []
// (works directly when [Todo] is Codable — Swift Foundation handles serialization)
```

### Expected Kotlin emit

```kotlin
// emitted at the top of the @Composable function:
val context = LocalContext.current
val prefs = remember { context.getSharedPreferences("pyreon-todomvc", Context.MODE_PRIVATE) }
var todos by remember {
  mutableStateOf(
    prefs.getString("todos", null)?.let { Json.decodeFromString<List<Todo>>(it) } ?: emptyList()
  )
}
LaunchedEffect(todos) {
  prefs.edit().putString("todos", Json.encodeToString(todos)).apply()
}
```

**OR** (cleaner — using DataStore):

```kotlin
val dataStore = LocalContext.current.dataStore
val todos by dataStore.data.map { it[todosKey] ?: emptyList() }.collectAsState(initial = emptyList())
// ... write back via dataStore.edit { ... } in handlers
```

### Mapping notes

`useStorage` is the **first time in the walkthrough the mapping requires a non-trivial cross-platform abstraction**. On web it's `localStorage`. On iOS the idiomatic equivalent is `@AppStorage` (SwiftUI property wrapper); on Android it's either `SharedPreferences` or the newer `DataStore`.

The PMTC plan named this pattern (`@pyreon/camera` example with `@pyreon/camera-ios` / `@pyreon/camera-android` per-platform implementations). For `@pyreon/storage` the equivalent split is:

| Package                   | Implementation                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `@pyreon/storage`         | Defines the `useStorage<T>(key, defaultValue)` interface + the web (`localStorage`) implementation         |
| `@pyreon/storage-ios`     | Swift package providing `PyreonStorage.useStorage(key:default:)` backed by `@AppStorage` or `UserDefaults` |
| `@pyreon/storage-android` | Kotlin module providing `PyreonStorage.useStorage(key, default)` backed by `DataStore`                     |

The compiler detects the `useStorage` import at compile time and substitutes the per-platform binding in emit output. User code never references platform storage APIs directly.

### Compiler change required

1. **Recognize `useStorage` as a special import** — when emitting native targets, substitute the call site with the platform-equivalent shape.
2. **Codable derivation** — the type used as `useStorage<T>` must be marked Codable (Swift) / Serializable (Kotlin). Emitter must check the type, emit the conformance annotation if missing, and emit a friendly compiler error if T can't be made Codable (e.g. contains a closure).
3. **`@pyreon/storage-ios` / `@pyreon/storage-android` SPM/AAR packages** must exist before this code can build — they're Phase 1+ deliverables, NOT Phase 0.

### Gap (named #5 in the TL;DR)

**For Phase 0**: `useStorage` is out of scope. The counter-app spike doesn't need persistence. TodoMVC in Phase 0 would use in-memory state (`signal<Todo[]>([])`) instead of `useStorage`.

**For Phase 1+**: the `@pyreon/storage` cross-platform abstraction needs to be designed as a foundational package. The PMTC plan's "per-platform abstraction layer" section is the right shape but doesn't specify the package boundaries. This walkthrough names the specific shape; a follow-up plan doc (`native-platforms-platform-abstractions.md`?) could formalize it across storage / camera / push / biometrics / deep links.

---

## Section 3 — TextField with two-way binding

### Pyreon source

```tsx
<TextField
  value={draft}
  onInput={(e) => draft.set(e.target.value)}
  placeholder="What needs to be done?"
/>
```

### Expected Swift emit

```swift
TextField("What needs to be done?", text: $draft)
```

**Yes, that compact.** SwiftUI's `TextField` takes a `Binding<String>` (the `$` prefix on a `@State` variable produces one). The two-way binding handles both read and write semantics automatically. The compiler must:

1. Detect the `<TextField value={signal} onInput={(e) => signal.set(e.target.value)}>` pattern
2. Verify the onInput body is exactly `signal.set(e.target.value)` (or `e.currentTarget.value`)
3. Emit `TextField(placeholder, text: $signalName)` collapsing both props into one Binding

If the onInput body is non-trivial (validation, transformation, derived signals), fall back to:

```swift
TextField("What needs to be done?", text: Binding(
  get: { draft },
  set: { newValue in draft = newValue.uppercased() } // user's onInput body
))
```

### Expected Kotlin emit

```kotlin
TextField(
  value = draft,
  onValueChange = { draft = it },
  placeholder = { Text("What needs to be done?") },
)
```

Kotlin's Compose `TextField` already uses the one-way value+onValueChange pattern — **maps 1:1 with the Pyreon source**, no special handling needed. The compiler emits the same shape verbatim.

### Mapping notes

This is the **first mapping where iOS and Android diverge**. Compose's API matches Pyreon's source idiomatically. SwiftUI's API is more compact (Binding) and would feel un-idiomatic if emitted as a verbose Binding construction. The compiler should special-case the simple `signal + matched-onInput` pattern for Swift to produce idiomatic output.

### Compiler change required (named #1 in TL;DR)

1. **Pattern recognition**: detect `<TextField value={X} onInput={(e) => X.set(e.target.value)}>` where the onInput body is exactly the inverse of the value read.
2. **Swift emit**: collapse to `TextField(placeholder, text: $X)`.
3. **Kotlin emit**: no special handling — already matches.

This is one of several "Swift wants two-way binding, Kotlin wants one-way callback" patterns. Same handling applies to `<Slider>`, `<Toggle>` (`Switch`), `<Picker>`, `<DatePicker>`.

### Gap

⚠️ **Needs compiler special-case**. Listed as #1 in the TL;DR breakage list. Without it, Swift output works but reads as un-idiomatic SwiftUI (verbose Binding constructions everywhere). With it, Swift output reads as natural SwiftUI.

---

## Section 4 — keyboard event handling (submit on Enter)

### Pyreon source

```tsx
<TextField
  value={draft}
  onInput={...}
  onKeyDown={(e) => e.key === 'Enter' && addTodo()}
  placeholder="..."
/>
```

### Expected Swift emit

```swift
TextField("...", text: $draft)
  .onSubmit { addTodo() }
```

SwiftUI doesn't expose raw keyboard events the way HTML does. `.onSubmit` is the idiomatic "Enter key inside a text field" hook. The compiler must recognize the `onKeyDown={(e) => e.key === 'Enter' && ...}` pattern and emit `.onSubmit { body }`.

### Expected Kotlin emit

```kotlin
TextField(
  value = draft,
  onValueChange = { draft = it },
  keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
  keyboardActions = KeyboardActions(onDone = { addTodo() }),
  placeholder = { Text("...") },
)
```

Compose's keyboard handling is more verbose — needs both `keyboardOptions` (declares the IME action) and `keyboardActions` (handles it). The compiler emits both together when the pattern is detected.

### Mapping notes

This is the first place where **the source idiom (`onKeyDown` with `e.key === 'Enter'`) has no clean platform equivalent**. Web exposes keyboard events directly; SwiftUI/Compose abstract them behind submit/IME actions.

Other keyboard cases follow the same shape:

- `e.key === 'Escape'` → SwiftUI `.onExitCommand` / Compose dismiss handler (more complex)
- `e.key === 'Tab'` → SwiftUI handles natively / Compose `Modifier.focusable() + focusOrder`
- Arrow keys for keyboard navigation in lists → platform-specific patterns

For TodoMVC, only Enter matters. The compiler must recognize the `e.key === 'Enter'` shape specifically.

### Compiler change required (named #2 in TL;DR)

1. **Pattern recognition**: detect `onKeyDown={(e) => e.key === 'Enter' && BODY}` (and the AND-chained variants).
2. **Swift emit**: `.onSubmit { BODY }` modifier on the parent TextField.
3. **Kotlin emit**: `keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = { BODY })` props on the TextField.
4. **Other keys**: stub for Phase 1 — emit a `// pyreon-native-skip` warning for non-Enter keys until Phase 2 adds platform-specific handlers.

### Gap

⚠️ **Needs compiler special-case**. Listed as #2 in the TL;DR. Without it, the Pyreon source compiles to Swift that uses raw keyboard listeners (verbose, non-idiomatic) and Kotlin that... doesn't work at all (Compose has no raw keyDown on TextField). With it, both targets get clean idiomatic emit.

---

## Section 5 — array mutation idioms (`addTodo` / `remove` / `clearCompleted`)

### Pyreon source

```tsx
const addTodo = () => {
  const text = draft().trim()
  if (text.length === 0) return
  todos.set([...todos(), { id: nextId++, text, done: false }])
  draft.set('')
}

const remove = (id: number) => {
  todos.set(todos().filter((t) => t.id !== id))
}

const clearCompleted = () => {
  todos.set(todos().filter((t) => !t.done))
}
```

### Expected Swift emit — option A (faithful spread)

```swift
private func addTodo() {
  let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
  if text.isEmpty { return }
  todos = todos + [Todo(id: nextId, text: text, done: false)]
  nextId += 1
  draft = ""
}

private func remove(id: Int) {
  todos = todos.filter { $0.id != id }
}

private func clearCompleted() {
  todos = todos.filter { !$0.done }
}
```

### Expected Swift emit — option B (idiomatic mutation)

```swift
private func addTodo() {
  let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
  if text.isEmpty { return }
  todos.append(Todo(id: nextId, text: text, done: false))
  nextId += 1
  draft = ""
}

private func remove(id: Int) {
  todos.removeAll { $0.id == id }
}

private func clearCompleted() {
  todos.removeAll { $0.done }
}
```

Option B is more idiomatic Swift. Both produce identical observable behavior because `@State var todos: [Todo]` triggers SwiftUI re-render on any mutation (Swift arrays have value semantics; mutating self via array methods writes back to the storage).

### Expected Kotlin emit — option A (faithful spread)

```kotlin
fun addTodo() {
  val text = draft.trim()
  if (text.isEmpty()) return
  todos = todos + Todo(id = nextId, text = text, done = false)
  nextId += 1
  draft = ""
}

fun remove(id: Int) {
  todos = todos.filter { it.id != id }
}

fun clearCompleted() {
  todos = todos.filter { !it.done }
}
```

This works with `var todos by remember { mutableStateOf<List<Todo>>(emptyList()) }` (the PR #794 #06 fixture's shape). Reassignment triggers re-composition.

### Expected Kotlin emit — option B (idiomatic mutation with `mutableStateListOf`)

```kotlin
// state declaration changes:
val todos = remember { mutableStateListOf<Todo>() }

fun addTodo() {
  val text = draft.trim()
  if (text.isEmpty()) return
  todos.add(Todo(id = nextId, text = text, done = false))
  nextId += 1
  draft = ""
}

fun remove(id: Int) {
  todos.removeAll { it.id == id }
}

fun clearCompleted() {
  todos.removeAll { it.done }
}
```

**Option B is materially better for perf on Android**: `mutableStateListOf` provides per-element observability, so only changed list items recompose. With `mutableStateOf(listOf())` (option A), the whole `LazyColumn` recomposes on every list change.

### Mapping notes

This is the **first mapping where the compiler faces an idiom choice that affects perf**:

- **Option A** (faithful spread emission): source-fidelity wins, code reads close to the Pyreon original. Pyreon's reactivity model handles the spread idiom efficiently via signal diffing. Both Swift and Kotlin output WORK correctly with this shape.
- **Option B** (native mutation): platform idiom wins, code reads as natural Swift/Kotlin. **On Android, option B has measurable perf advantages** because Compose's `mutableStateListOf` enables per-row recomposition (vs option A's whole-list recompose).

The PMTC plan's structural mapping table doesn't address this explicitly — it lists `signal<T>(initial)` mapping to `@State` / `mutableStateOf` but doesn't differentiate list-shaped state.

### Compiler change required (named #3 in TL;DR)

**Decision needed before Phase 1**: option A or option B?

Recommendation: **option B for both platforms**, with a fallback to option A when the source spread is structurally complex (e.g. `todos.set([...prefix, ...todos(), ...suffix])` — multiple concatenation sources).

This requires:

1. Detect `<signal>.set([...<signal>(), <value>])` as "append" → emit `.append(value)` / `.add(value)`
2. Detect `<signal>.set(<signal>().filter(<predicate>))` as "remove matching" → emit `.removeAll(<predicate>)` / `.removeAll(<predicate>)`
3. Detect `<signal>.set(<signal>().map(<transform>))` as "transform-in-place" — emit per-element mutation if `transform` is `t => t.id === id ? { ...t, field: value } : t` shape (the per-item update idiom — section 6)
4. For Kotlin specifically, **change the array signal emission from `mutableStateOf(listOf())` to `mutableStateListOf<T>()`** (currently the PR #794 fixture #06 emits `mutableStateOf<List<TodoListItem>>(listOf())` — should become `mutableStateListOf<TodoListItem>()`).

### Gap

⚠️ **Compiler design choice + emit change required**. Listed as #3 in the TL;DR. Option A ships sooner; option B is the correct long-term answer for production perf on Android.

---

## Section 6 — partial object-in-array updates (`toggle`)

### Pyreon source

```tsx
const toggle = (id: number) => {
  todos.set(todos().map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
}
```

### Expected Swift emit (idiomatic mutation)

```swift
private func toggle(id: Int) {
  if let index = todos.firstIndex(where: { $0.id == id }) {
    todos[index].done.toggle()
  }
}
```

### Expected Kotlin emit (with `mutableStateListOf`)

```kotlin
fun toggle(id: Int) {
  val index = todos.indexOfFirst { it.id == id }
  if (index >= 0) {
    todos[index] = todos[index].copy(done = !todos[index].done)
  }
}
```

### Mapping notes

Same option-A vs option-B trade-off as section 5. The PMTC plan doesn't address it.

Idiomatic Swift uses `.toggle()` for `Bool` properties — a tiny but real platform convention. Idiomatic Kotlin uses `.copy()` for data class field updates (data classes are immutable; `copy()` returns a new instance).

For the compiler to emit the idiomatic shape, it needs to recognize:

- `map(t => t.id === ID ? { ...t, FIELD: !t.FIELD } : t)` → `[index].FIELD.toggle()` (Swift) / `[index] = it.copy(FIELD = !it.FIELD)` (Kotlin)
- `map(t => t.id === ID ? { ...t, FIELD: VALUE } : t)` → `[index].FIELD = VALUE` (Swift) / `[index] = it.copy(FIELD = VALUE)` (Kotlin)

### Compiler change required (named #4 in TL;DR)

Pattern-match on the `.map(t => t.id === ID ? { ...t, ... } : t)` shape and emit the platform-idiomatic in-place update. Falls back to faithful spread emission for complex transforms.

### Gap

⚠️ **Same as #3 — compiler design choice**. The faithful-spread emit works; the idiomatic emit produces nicer-looking output. Listed as #4 in the TL;DR.

---

## Section 7 — filter state as discriminated union

### Pyreon source

```tsx
type Filter = 'all' | 'active' | 'completed'
const filter = signal<Filter>('all')

// usage:
filter.set('active')
if (filter() === 'completed') { ... }
```

### Expected Swift emit

```swift
enum Filter: String {
  case all, active, completed
}

@State private var filter: Filter = .all

// usage:
filter = .active
if filter == .completed { ... }
```

### Expected Kotlin emit

```kotlin
enum class Filter { all, active, completed }

var filter by remember { mutableStateOf(Filter.all) }

// usage:
filter = Filter.active
if (filter == Filter.completed) { ... }
```

### Mapping notes

This is the **first place a string-literal union type produces meaningfully better code on native targets**. On web Pyreon emits string comparisons (`filter() === 'completed'`). On iOS/Android, native enums provide:

- Compile-time exhaustiveness in `switch` / `when` statements
- Better IDE autocomplete
- No risk of typos at use sites

The PMTC plan's structural mapping table doesn't address string-literal unions explicitly; PR 5d in the Phase 0 roadmap (union types) is the right place for this work.

### Compiler change required (named #6 in TL;DR)

1. Detect `signal<'literal1' | 'literal2' | ...>(initial)` and emit a native enum + `@State`/`mutableStateOf` typed to that enum.
2. Translate string literals at use sites (`filter() === 'completed'` → `filter == .completed` / `filter == Filter.completed`).
3. Translate enum value assignment (`filter.set('active')` → `filter = .active` / `filter = Filter.active`).

This is also a precondition for **better `<Show when={...}>` emission with enum discriminants** and **`switch (filter()) { case 'active': ... }` (when Pyreon adds match/switch components — Phase 2+).**

### Gap

⚠️ **Needs PR 5d (type mapper unions)**. Listed as #6 in the TL;DR. Compiler currently emits raw `String` for these — works but loses native ergonomics.

---

## Section 8 — `<For>` over a `Computed` (visible filtered list)

### Pyreon source

```tsx
const visible = computed(() => {
  const xs = todos()
  if (filter() === 'active') return xs.filter(t => !t.done)
  if (filter() === 'completed') return xs.filter(t => t.done)
  return xs
})

// later in JSX:
<For each={visible} by={(t) => t.id}>
  {(t) => <TodoRow todo={t} onToggle={...} onRemove={...} />}
</For>
```

### Expected Swift emit

```swift
private var visible: [Todo] {
  if filter == .active { return todos.filter { !$0.done } }
  if filter == .completed { return todos.filter { $0.done } }
  return todos
}

// in body:
ForEach(visible, id: \.id) { t in
  TodoRow(
    todo: t,
    onToggle: { toggle(id: t.id) },
    onRemove: { remove(id: t.id) },
  )
}
```

### Expected Kotlin emit

```kotlin
val visible by remember(todos, filter) {
  derivedStateOf {
    when (filter) {
      Filter.active -> todos.filter { !it.done }
      Filter.completed -> todos.filter { it.done }
      Filter.all -> todos
    }
  }
}

// in body:
LazyColumn {
  items(visible, key = { it.id }) { t ->
    TodoRow(
      todo = t,
      onToggle = { toggle(t.id) },
      onRemove = { remove(t.id) },
    )
  }
}
```

### Mapping notes

The Swift emit collapses the `computed(...)` to a Swift `private var visible: [Todo] { ... }` (a computed property). The body re-computes on every access, but SwiftUI's diffing only re-renders rows whose identity changed (thanks to `id: \.id`).

The Kotlin emit uses `derivedStateOf` — Compose's official "compute from observed state" primitive. Re-composes only when the computed value's _result_ changes (per Compose's structural-equality check).

Note: PR #794 fixture #05 (multi-signal + computed) already emits the `private var X: Int { ... }` Swift pattern and the `val X by remember { derivedStateOf { ... } }` Kotlin pattern. **TodoMVC's computed-list shape is structurally the same** — just returns `[Todo]` instead of `Int`. ✅ No new compiler work needed.

The `when` statement in Kotlin is more idiomatic than chained `if`s — but the compiler can keep emitting chained `if`s (matches the Pyreon source structure 1:1). Optimization for Phase 1+.

### Gap

None for the structural mapping. ✅ The enum-vs-string question (section 7) does affect the body — using string equality requires the same emit shape but with `if (filter == "active")` instead of `if (filter == .active)`. The mapping itself holds.

---

## Section 9 — `<TodoRow>` component with prop-driven rocketstyle dimension

### Pyreon source

```tsx
function TodoRow(props: { todo: Todo; onToggle: () => void; onRemove: () => void }) {
  return (
    <HStack state={props.todo.done ? 'completed' : 'active'}>
      <Checkbox checked={props.todo.done} onChange={props.onToggle} />
      <Text>{props.todo.text}</Text>
      <Button onClick={props.onRemove}>×</Button>
    </HStack>
  )
}
```

(Assumes `HStack` is a rocketstyle wrapper with a `state` dimension that styles "completed" rows with strikethrough + reduced opacity.)

### Expected Swift emit

```swift
struct TodoRow: View {
  let todo: Todo
  let onToggle: () -> Void
  let onRemove: () -> Void

  var body: some View {
    HStack {
      Toggle("", isOn: Binding(get: { todo.done }, set: { _ in onToggle() }))
        .labelsHidden()
      Text(todo.text)
      Button("×") { onRemove() }
    }
    .modifier(HStackStyle(state: todo.done ? .completed : .active))
  }
}

// HStackStyle emitted by PR 7c (rocketstyle dimensions → ViewModifier)
enum HStackState: String { case active, completed }

struct HStackStyle: ViewModifier {
  let state: HStackState
  func body(content: Content) -> some View {
    content
      .opacity(state == .completed ? 0.4 : 1.0)
      .overlay(
        Rectangle()
          .frame(height: 1)
          .foregroundColor(.black)
          .opacity(state == .completed ? 1.0 : 0.0)
      )
  }
}
```

### Expected Kotlin emit

```kotlin
@Composable
fun TodoRow(
  todo: Todo,
  onToggle: () -> Unit,
  onRemove: () -> Unit,
) {
  Row(
    modifier = Modifier
      .pyreonHStackStyle(state = if (todo.done) HStackState.completed else HStackState.active)
  ) {
    Checkbox(checked = todo.done, onCheckedChange = { onToggle() })
    Text(text = todo.text)
    Button(onClick = onRemove) { Text("×") }
  }
}

enum class HStackState { active, completed }

// PR 7c-emitted extension:
fun Modifier.pyreonHStackStyle(state: HStackState): Modifier = this
  .alpha(if (state == HStackState.completed) 0.4f else 1.0f)
  .let {
    if (state == HStackState.completed) {
      it.drawWithContent { drawContent(); /* strikethrough line */ }
    } else it
  }
```

### Mapping notes

The **conditional dimension expression** (`state={props.todo.done ? 'completed' : 'active'}`) is where breakage #7 in the TL;DR fires.

The naive emit would put the ternary inside the `.modifier(...)` call:

```swift
.modifier(HStackStyle(state: props.todo.done ? .completed : .active))
```

This works — but if the user wrote a more complex expression (`state={getStateForTodo(props.todo, currentTime)}`), SwiftUI's diff-based re-render needs the modifier to be **structurally stable** between renders. If the modifier construction itself involves runtime computation that returns different objects, SwiftUI will rebuild the view tree on every parent re-render.

For TodoMVC specifically, the expression IS simple (a ternary on a single field), and the emit works. For more complex apps it's a foot-gun.

**Recommendation**: hoist the dimension expression into a `let` binding at the top of `body`, so SwiftUI sees a stable modifier construction:

```swift
var body: some View {
  let state: HStackState = todo.done ? .completed : .active
  return HStack {
    // ...
  }
  .modifier(HStackStyle(state: state))
}
```

### Compiler change required (named #7 in TL;DR)

1. Detect conditional dimension expressions on rocketstyle components
2. Hoist them into `let` bindings at the top of `body`
3. Reference the hoisted name in the `.modifier(...)` call

This is **also a precondition for animations** — SwiftUI animates between modifier-state changes if the modifier construction is stable.

### Gap

⚠️ **Needs compiler hoisting pass**. Listed as #7 in the TL;DR. Works without it for simple ternaries; breaks (or produces sub-optimal animations) for complex expressions.

---

## Section 10 — `<Show when={hasCompleted}>` conditional render

### Pyreon source

```tsx
<Show when={hasCompleted}>
  <Button onClick={clearCompleted}>Clear completed</Button>
</Show>
```

### Expected Swift emit

```swift
if hasCompleted {
  Button("Clear completed") { clearCompleted() }
}
```

### Expected Kotlin emit

```kotlin
if (hasCompleted) {
  Button(onClick = { clearCompleted() }) { Text("Clear completed") }
}
```

### Mapping notes

PR #794 fixture #07 already handles this exact shape. ✅

One subtlety: `hasCompleted` is a `Computed<boolean>`. The Pyreon-side runtime treats this as auto-tracked (the `<Show>` re-renders when `hasCompleted` flips). Swift's emit (computed property) handles this automatically via SwiftUI's diff. Kotlin's emit (`derivedStateOf`) handles it via Compose's `State<T>` observation.

### Gap

None. ✅

---

## Section 11 — reactive text interpolation

### Pyreon source

```tsx
<Text>{() => `${remaining()} items left`}</Text>
```

### Expected Swift emit

```swift
Text("\(remaining) items left")
```

### Expected Kotlin emit

```kotlin
Text(text = "${remaining} items left")
```

### Mapping notes

PR #794 fixtures #02 / #05 already handle the simple form (`<Text>{count}</Text>`). The arrow-function-wrapped form `<Text>{() => expr}</Text>` is the Pyreon idiom for "this expression should track and re-render."

The compiler's reactivity-detection pass should treat both forms equivalently for native targets (they both reduce to "this Text node depends on these signals; re-render when they change").

### Compiler change required

The PR #794 emitter already handles the bare-signal form. Extending to the arrow-function form is a small parser change.

### Gap

None significant. ✅

---

## Section 12 — multi-signal computed (`remaining`, `hasCompleted`)

### Pyreon source

```tsx
const remaining = computed(() => todos().filter((t) => !t.done).length)
const hasCompleted = computed(() => todos().some((t) => t.done))
```

### Expected Swift emit

```swift
private var remaining: Int { todos.filter { !$0.done }.count }
private var hasCompleted: Bool { todos.contains { $0.done } }
```

### Expected Kotlin emit

```kotlin
val remaining by remember(todos) { derivedStateOf { todos.count { !it.done } } }
val hasCompleted by remember(todos) { derivedStateOf { todos.any { it.done } } }
```

### Mapping notes

Same as PR #794 fixture #05. The Swift emit is a computed property; the Kotlin emit is `derivedStateOf`. Both correctly handle multi-signal dependencies (Swift via the property body reading `todos` and `filter`; Kotlin via the `remember(todos)` key).

The `.some()` → `.contains` / `.any { ... }` is an idiomatic translation the compiler should handle:

| Pyreon (JS) method          | Swift                 | Kotlin                 |
| --------------------------- | --------------------- | ---------------------- |
| `.filter(p)`                | `.filter(p)`          | `.filter(p)`           |
| `.map(f)`                   | `.map(f)`             | `.map(f)`              |
| `.find(p)`                  | `.first(where: p)`    | `.firstOrNull(p)`      |
| `.some(p)`                  | `.contains(where: p)` | `.any(p)`              |
| `.every(p)`                 | `.allSatisfy(p)`      | `.all(p)`              |
| `.length` / `.length === 0` | `.count` / `.isEmpty` | `.size` / `.isEmpty()` |
| `.reduce(f, init)`          | `.reduce(init, f)`    | `.fold(init, f)`       |
| `.includes(x)`              | `.contains(x)`        | `.contains(x)`         |

### Compiler change required

Translate the JS Array method names to platform equivalents at emit time. This is **structural-mapping work that the PMTC plan named as part of the type-mapper** (PR 5b — function types — naturally includes method-name translation when the function is invoked on a known array type).

### Gap

⚠️ **Method translation table needed** — straightforward but tedious. ~15 array methods + ~10 string methods + ~5 object methods to handle. Phase 1 work.

---

## Section 13 — URL hash filter sync (NOT in Phase 0)

### Pyreon source (Phase 3 — uses router)

```tsx
import { useRouter } from '@pyreon/router'

const router = useRouter()
// router.hash() === '#/active' → filter = 'active'
// filter.set('active') → router.push('#/active')
```

### Mapping notes

iOS/Android have no URL bar. The PMTC plan defers this to Phase 3 with `@pyreon/router-ios` / `@pyreon/router-android`.

For Phase 0/1 TodoMVC: skip the URL sync entirely. Filter state stays in-memory as a signal. Web users lose deep-linking to a filter; mobile users never had it.

For Phase 3+: `@pyreon/router-ios` would map `router.push('#/active')` to NavigationStack path manipulation (with the hash treated as a route segment); `@pyreon/router-android` would use NavController's back stack. Persisting filter across app restarts would require pairing with `@pyreon/storage`.

### Gap (named #8 in TL;DR)

⚠️ **Out of scope for Phase 0/1**. Listed as #8 in the TL;DR. Punted to Phase 3 router work.

---

## G3 deliberation — array mutation idioms (DECIDED 2026-05-21)

G3 is the only named gap that's a SEMANTIC CHOICE rather than a missing feature. Both options below are correct; the choice is about FIDELITY to Pyreon source vs IDIOM to the platform. This section documents the decision so future Phase 2 PRs don't re-litigate it.

### The choice

Pyreon source uses JS-immutable idioms:

```tsx
// Append
todos.set([...todos(), newTodo])

// Remove
todos.set(todos().filter((t) => t.id !== id))

// Replace-one (partial update — closed by G4 #846)
todos.set(todos().map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
```

These have two valid native emits:

**Option A — FIDELITY (immutable spread, emit verbatim)**

- Swift: `todos = todos + [newTodo]` (re-assigns the `@State` array — SwiftUI sees the value change via Equatable diff)
- Kotlin: `todos = todos + listOf(newTodo)` (re-assigns the `mutableStateOf` var — same diff detection)

**Option B — IDIOM (native mutation)**

- Swift: `todos.append(newTodo)` (in-place; `@State` observes the change via Equatable diff)
- Kotlin: `todos.add(newTodo)` (requires `mutableStateListOf<Todo>()` for fine-grained per-row reactivity)

### Decision: Option A for Phase 1; Option B opt-in for Phase 2 if benchmarks justify

### Reasoning

1. **Source semantics preserved**. A developer reading the Pyreon source AND the emitted Swift sees the same pattern. Mental model uniform across all three targets (web / iOS / Android).

2. **Both targets handle Option A correctly**. Swift's `@State` observes value changes; Compose's `mutableStateOf` does the same. No correctness gap. The "re-renders the entire list" perf concern is real on Compose with naive `mutableStateOf<List<T>>` but only matters at 10k+ items (TodoMVC scale: < 1000 items, no measurable diff).

3. **Compiler emission complexity stays lower**. Option B requires detecting WHICH mutation idiom is being used (`.append` vs `.filter` vs `.map`) and emitting a DIFFERENT shape per pattern (mutating method vs in-place index assignment). Option A is uniform — every array assignment emits the same shape regardless of source idiom.

4. **G4 #846 already cemented Option A for partial updates**. The `.map(t => cond ? {...t, k: v} : t)` shape emits as:
   - Swift: `todos = todos.map({ t in cond ? { var c = t; c.k = v; return c }() : t })`
   - Kotlin: `todos = todos.map { t -> if (cond) t.copy(k = v) else t }`

   Both are functional and platform-idiomatic for the immutable-spread style. Changing G4 to Option B (index-mutation `todos[i].k = !todos[i].k`) would require a separate pattern detection and a non-trivial refactor.

5. **Phase 2 opt-in path**. When and IF benchmarks show real-world perf regressions on long lists, the opt-in shape can be:
   - Extend `signal-options` with `{ fineGrained: true }` flag on `signal<T[]>(initial, { fineGrained: true })`
   - Compiler detects the flag and emits Option B shape (Kotlin: `mutableStateListOf<T>()` + `.add`/`.removeAt`/index-mutation; Swift: `.append`/`.remove(at:)`/index-mutation)
   - The flag is per-signal, not per-mutation — opt-in at the data declaration, not at every mutation site

### What this means for TodoMVC

The locked snapshot ships Option A:

```swift
// addTodo (Option A — immutable spread)
todos = todos + [(id: nextId + 1, text: text, done: false)]

// toggle (Option A — immutable map + G4 IIFE copy)
todos = todos.map({ t in t.id == id ? { var c = t; c.done = !t.done; return c }() : t })

// remove + clearCompleted (Option A — filter)
todos = todos.filter({ t in t.id != id })
todos = todos.filter({ t in !t.done })
```

```kotlin
// addTodo (Option A — immutable spread)
todos = todos + listOf(/* ... */)

// toggle (Option A — immutable map + G4 .copy)
todos = todos.map { t -> if (t.id == id) t.copy(done = !t.done) else t }

// remove + clearCompleted
todos = todos.filter { t -> t.id != id }
todos = todos.filter { t -> !t.done }
```

All four mutation functions emit Option A. No compiler change needed beyond what G4 #846 + the existing emit-swift/emit-kotlin call paths already deliver.

### Status

✓ **CLOSED 2026-05-21** — Decision documented; Phase 1 ships Option A; Phase 2 may add `{ fineGrained: true }` opt-in (Option B) if perf benchmarks justify it.

---

## Summary of compiler changes the walkthrough surfaces

Mapped to the Phase 0/1 roadmap PR numbers and the in-compiler closure PRs landed 2026-05-19 to 2026-05-21:

| #   | Change                                                                              | Where it lands                                                              | Status                                                                                    |
| --- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | TextField two-way binding emission (Swift `$` Binding)                              | [#842](https://github.com/pyreon/pyreon/pull/842)                           | ✓ CLOSED                                                                                  |
| 2   | Keyboard event handling (`onKeyDown` Enter → `.onSubmit` / `keyboardActions`)       | [#844](https://github.com/pyreon/pyreon/pull/844)                           | ✓ CLOSED                                                                                  |
| 3   | Array mutation idioms (faithful spread vs idiomatic mutation) — design decision     | This doc (G3 deliberation above)                                            | ✓ DECIDED (Option A immutable-spread)                                                     |
| 4   | Object-in-array partial updates (`.map(t => t.id === id ? {...t, F: V} : t)`)       | [#846](https://github.com/pyreon/pyreon/pull/846) (cascade-merged via #844) | ✓ CLOSED                                                                                  |
| 5   | `@pyreon/storage` `useStorage<T>` → Swift `@AppStorage` / Kotlin `rememberSaveable` | [#849](https://github.com/pyreon/pyreon/pull/849)                           | ✓ CLOSED (in-compiler scope; Phase 2 needs Codable bridge for non-RawRepresentable types) |
| 6   | String-literal union → native enum                                                  | [#835](https://github.com/pyreon/pyreon/pull/835)                           | ✓ CLOSED                                                                                  |
| 7   | Conditional dimension expression hoisting on rocketstyle                            | Phase 3 (rocketstyle conditional dimension emit)                            | ⏸ DEFERRED                                                                                |
| 8   | URL hash / router cross-platform sync                                               | Phase 3 (`@pyreon/router-ios` / `@pyreon/router-android` packages)          | ⏸ DEFERRED                                                                                |

**6 of 8 gaps CLOSED** (G1 / G2 / G3 / G4 / G5 / G6). Two (G7 rocketstyle conditional, G8 router URL-hash) remain Phase 3 work — they require either deeper rocketstyle emit refactoring or new cross-platform abstraction packages outside the compiler core.

### The TodoMVC baseline test as structural proof

The locked snapshot at `packages/native/compiler/src/tests/todomvc-baseline.test.ts` is now the structural proof of closure. **0 `it.todo`, 238 passing**. Each closed gap has both:

1. A locked Swift-emit inline snapshot proving the EXACT emitted shape
2. An explicit gap-closure assertion (e.g. `expect(out.code).toContain('text: $draft')`) so the closure is unambiguously visible to readers scanning the test file

### Known partial closures (Phase 2 hardening)

The PR descriptions are explicit about what's NOT done. Summary:

- **G5 `@AppStorage` type constraint** — Swift `@AppStorage` only accepts String/Int/Double/Bool/URL/Data/RawRepresentable. TodoMVC's `[Todo]` emits the shape but fails `swiftc -typecheck`. Phase 2 needs a Codable-Data bridge.
- **G5 `rememberSaveable` type constraint** — Compose requires Parcelable/Serializable types or a custom Saver. `List<Todo>` needs a Saver. Phase 2.
- **G5 storage key not in Kotlin call site** — `rememberSaveable(key = "...")` overload exists; Phase 2 if cross-host disambiguation needed.
- **G4 multi-spread objects** — `{ ...a, ...b, k: v }` falls through to the tuple-literal emit. Phase 2 if real-world apps hit it.
- **Anonymous object types emit as Swift tuples** — `[Todo]` where `Todo = {...}` emits as `[(id: Int, text: String, done: Bool)]` (labelled tuple). Phase 2 should emit `struct Todo` instead — unblocks Codable bridge, Compose Saver, and richer type inference.
- **Button `onClick={functionRef}` (bare identifier, not call)** — emits as `{ functionRef }` (closure returning the function reference, not calling it). Different parse path (`emitSwiftAction` arrow-stripping); not blocking TodoMVC because TodoMVC wraps in `onClick={() => fn()}` arrow.

These are KNOWN PARTIAL CLOSURES, not unknown bugs. The structural contract — "TodoMVC compiles to parseable Swift + Kotlin via the in-compiler scope" — is closed. Full type-safe round-trip is incremental Phase 2 hardening.

The 7 fixtures in PR #794 covered the **structural mapping primitives**. TodoMVC exposed the **composition gaps** — what happens when you compose the primitives into a real app. With the 6 closures above, the composition story is structurally complete; what remains is hardening, real-device validation, and the two Phase 3 gaps.

---

## Recommendations for the PMTC roadmap

1. **Add TodoMVC as a Phase 1 reference example.** It's the right balance of "non-trivial" and "small enough to maintain." After Phase 0's counter app proves criterion 2 (signal → @State round-trip), TodoMVC becomes the Phase 1 deliverable that proves the composition story.

2. **The 6 in-Phase compiler changes should be planned as PRs.** Specifically:
   - Two new Phase 1 PRs: "two-way binding emission" + "keyboard event handler patterns"
   - One Phase 0 PR extension: rocketstyle emitter (PR 7c) hoists conditional dimension expressions
   - One Phase 0 PR extension: type mapper unions (PR 5d) recognizes string-literal-union signals
   - One Phase 1 design decision: option A (faithful spread) vs option B (idiomatic mutation) for array signals
   - One Phase 1 package design: `@pyreon/storage` cross-platform shape

3. **Don't try to ship TodoMVC in Phase 0.** Phase 0's deliverable is the counter app proving the structural pipeline. TodoMVC is Phase 1's reference example AFTER the counter works AND the composition gaps are closed.

4. **The walkthrough surfaces TWO patterns the PMTC plan's mapping table is missing**:
   - **String-literal unions → native enums** (the plan mentions discriminated unions in passing but doesn't explicitly call out string-literal-only unions as a special case)
   - **Two-way bindings on form inputs** (SwiftUI's Binding shape is conceptually different from Pyreon's signal+onInput pattern; needs explicit recognition)

   Both should be added to the plan's mapping table for the next revision.

5. **Cross-platform abstraction packages need a meta-design before Phase 1.** The walkthrough names `@pyreon/storage` as one example. The same shape applies to `@pyreon/camera`, `@pyreon/push`, `@pyreon/biometrics`, `@pyreon/deep-links`. Before any one is built, the **package-split + compiler-binding-resolution mechanism** needs a stable spec. A follow-up plan doc (`native-platforms-platform-abstractions.md`?) is the right place.

6. **The "idiomatic emit vs faithful emit" decision (sections 5 + 6) is recurring.** It comes up for arrays, for object updates, for two-way bindings, for keyboard handlers. The PMTC plan should adopt an explicit position: **default to idiomatic emit, with a per-target diagnostic when the source idiom can't be cleanly translated.** This produces output that platform engineers recognize as native (the PMTC plan's central promise) and falls back to faithful spread emission when needed.

---

## What this doc validates

- ✅ **PMTC's structural mapping holds at TodoMVC scale.** All 11 Pyreon constructs map to platform-native equivalents.
- ⚠️ **8 named compositional gaps** require compiler / runtime work beyond the 7 isolated fixtures. None are fatal; all are foreseeable.
- ⚠️ **Cross-platform abstraction packages (`@pyreon/storage` shape)** need a meta-design before Phase 1 staffing.
- ✅ **Phase 0's counter-app deliverable is the right scope.** TodoMVC is a Phase 1 reference example, not a Phase 0 stretch goal.
- ⚠️ **Two patterns missing from the PMTC plan's mapping table** — string-literal unions, two-way bindings — should be added to the next plan revision.

The honest read: PMTC's structural premise survives the TodoMVC walkthrough. The premise is real. But shipping TodoMVC as a Phase 1 example requires more compiler work than the PMTC plan's mapping table implies — and the cross-platform abstraction packages (`@pyreon/storage` etc.) are a foundational concern the plan named but didn't fully scope.

If the Phase 0 spike validates criteria 1 + 2 + 3, the TodoMVC walkthrough validates that **Phase 1 has a clear scope of compiler-work-needed-to-ship-a-real-app**. Both are necessary; this doc closes the second.

---

## What this doc does NOT validate

- **Real-app perf at TodoMVC scale.** The mapping holds structurally; whether the emitted Swift/Kotlin runs at 60fps is unmeasured. Section 5's option-A-vs-option-B trade-off for Kotlin's `mutableStateListOf` specifically is a perf question, not a correctness question.
- **The user's mental model of "same code, different platforms"** — TodoMVC is small enough that the mental model holds. At 10x scale (a real shipping app) it might not. Open question for Phase 2.
- **Hot reload behavior across the compiler emit pipeline.** Punted to Phase 3.
- **Debugger / source-map fidelity** — Xcode breakpoints pointing at Pyreon source lines vs compiled Swift. Punted to Phase 1+.
- **Accessibility behavior of the emitted output.** SwiftUI's `Toggle` and `Button` have built-in accessibility; whether the compiler-emitted output preserves them correctly is unmeasured.
