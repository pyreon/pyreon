---
title: 'Multiplatform app (one source → web + iOS + Android)'
summary: 'Write ONE .tsx that PMTC compiles to SwiftUI + Compose. Stay inside the supported declarative subset + the 15 canonical primitives; web-only packages (charts/flow/editor) run only via a <WebView>. Knowing the boundary is how you build native correctly first-try.'
seeAlso: [routing-setup, state-management, data-fetching]
---

# Multiplatform app (one source → web + iOS + Android)

## The golden rule (read this first)

**PMTC compiles your COMPONENT SOURCE — signals, the 15 canonical primitives, a fixed hook set, and a narrow declarative TS subset — to SwiftUI (iOS) and Jetpack Compose (Android). It does NOT transpile npm packages to native.** So a multiplatform app is built from: the canonical primitives + reactivity + the ported hooks/services, written in the supported TS subset. Anything outside that compiles for web but **silently breaks or drops on native**. Build inside the lane and it works first-try; step outside and it won't.

> Status: native PMTC is **demo-quality** (self-rated 66/100). Per-PR validation is `swiftc -parse` + `kotlinc`-against-stubs (syntax-level); full device builds are advisory. Treat the rules below as hard constraints, not suggestions.

## Imports — the canonical layer

```tsx
import { Stack, Inline, Text, Heading, Button, Press, Field, Toggle,
         Image, Icon, Link, Scroll, Layer, Spacer, Modal } from '@pyreon/primitives'
import { signal, computed, effect } from '@pyreon/reactivity'
```

Use **`@pyreon/primitives`** (the multiplatform layer), NOT `@pyreon/elements` / `@pyreon/ui-components` (those are web-only, CSS-in-JS-coupled). The 15 primitives are the entire native UI vocabulary:

| Primitive | Web | iOS | Android | Notes |
|---|---|---|---|---|
| `<Stack>` | flex column | `VStack` | `Column` | `direction?="column"\|"row"`, `gap`, `align` |
| `<Inline>` | flex row | `HStack` | `Row` | sugar for `<Stack direction="row">`. **⚠ does NOT wrap** — see gotchas |
| `<Layer>` | abs/overlay | `ZStack` | `Box` | stacked children |
| `<Scroll>` | scroll container | `ScrollView` | `verticalScroll` Column | |
| `<Spacer>` | flex spacer | `Spacer` | `Spacer(Modifier.weight)` | |
| `<Text>` / `<Heading>` | `<span>`/`<h*>` | `Text` | `Text` | |
| `<Button onPress>` | `<button>` | `Button` | `Button` | styled CTA |
| `<Press onPress>` | `<div role=button>` | `Button {}` | `Box(clickable)` | unstyled tap target |
| `<Field value onChangeText>` | `<input>` | `TextField` | `TextField` | |
| `<Toggle>` | checkbox | `Toggle` | `Switch` | |
| `<Image>` / `<Icon>` | `<img>`/svg | `Image`/SF Symbol | `AsyncImage`/`Icon` | |
| `<Link>` | `<a>` | nav | nav | router-aware |
| `<Modal open onClose>` | overlay | `.sheet` | `Dialog` | |

One canonical event name everywhere: **`onPress`** (not `onClick`), **`onChangeText`**, `onSubmit`. Tokens-first styling: `padding={4}`, `gap="md"`. No responsive props on native (v1).

## Reactivity — the same on every target

```tsx
function Counter() {
  const count = signal(0)
  const doubled = computed(() => count() * 2)
  return (
    <Stack gap="md">
      <Text>{count()}</Text>
      <Text>{doubled()}</Text>
      <Button onPress={() => count.set(count() + 1)}>+1</Button>
    </Stack>
  )
}
```

`signal` → `@State`/`mutableStateOf`, `computed` → computed property/`derivedStateOf`. Write `count.set(v)` to update (never `count(v)`). Multi-statement handlers work: `onPress={() => { a.set(1); b.set(2) }}`.

## The supported TypeScript subset (stay inside this)

PMTC compiles a **deliberately narrow, declarative** subset. **Inside it, native emit is correct:**

- `signal` / `computed` / `effect`, typed props, the canonical-primitive JSX
- `<For each by>` / `<Show when>` / ternary / `if`
- array + string method calls (`.map`/`.filter`/`.find`/`.join`/`.toUpperCase`/…)
- **object-literal `type` aliases → structs**: `type Todo = { id: number; title: string }` ✅
- **string-literal union aliases → enums**: `type Filter = 'all' | 'active' | 'done'` ✅
- arithmetic (and `/` now yields a float: `7 / 2` → `3.5` on all targets)

**Outside it, native silently drops or mis-emits (the cliff):**

| Don't (silently breaks native) | Do instead |
|---|---|
| `interface Todo { … }` | `type Todo = { … }` (synthesizes a struct) |
| TS `enum Color { … }` | `type Color = 'red' \| 'green'` (string-literal union) |
| `class Foo { … }` | functions + signals (or `defineStore` / `model()`) |
| `const o = { a: 1 }` (bare local object) | a typed signal/store, or a `type`-aliased shape |
| `new Map()` / `new Set()` / `new Date()` | a plain object/array shape; pass time as a prop |
| `` `Hi ${name}` `` (template literal) | string concat `'Hi ' + name` (template-literal native support is partial) |
| `a?.b?.c` (optional chaining) | `a && a.b` guards |
| `for` / `while` / `switch` / `try` in a body | `.map`/`.filter`, `<For>`, ternary, `<Show>` |
| destructured props `function C({ x }) {}` | `function C(props) { … props.x … }` (destructure loses reactivity) |

The framework now **warns** when you declare a top-level `interface`/`enum`/`class` for native — but most of the other drops are silent. The `swiftc -parse` gate can't catch type-level corruption, so a wrong build can still pass CI: **stay in the subset.**

## Per-target hooks + services (these DO work on native)

```tsx
import { useStorage } from '@pyreon/storage'      // → @PyreonAppStorage / rememberPyreonStorage
import { useFetch } from '@pyreon/hooks'           // → PyreonFetch (URLSession / ktor)
import { useForm } from '@pyreon/form'             // → PyreonForm (device-proven)
import { usePermissions } from '@pyreon/permissions'
import { defineStore } from '@pyreon/store'        // → PyreonStore
import { useNavigate, useParams, useLoaderData } from '@pyreon/router'
```

Native-ported: reactivity, the 15 primitives, `store`, `machine`, `state-tree`, `i18n`, `form`, `permissions`, `storage`, the router (nested routes, `beforeEnter`, per-route `loader`), and the hooks `useFetch` / `useOnline` / `useClipboard` / `useColorScheme`. **For data, use `useFetch` — NOT `@pyreon/query`** (TanStack is web-only).

## Web-only packages — only via a `<WebView>` bridge

These can NOT be native-rendered (they're bound to canvas/DOM/vendors): **`@pyreon/charts`** (echarts), **`@pyreon/flow`** (elkjs+SVG), **`@pyreon/code`** (CodeMirror), **`@pyreon/dnd`**, **`@pyreon/document`**, **`@pyreon/query`**, **`@pyreon/table`/`virtual`**, and the whole CSS-in-JS UI stack (`elements`/`styler`/`rocketstyle`/`coolgrid`/`kinetic`).

You CAN still use them — host the web component in a **`<WebView>`** (a real browser engine) with the bidirectional bridge:

```tsx
import { WebView } from '@pyreon/primitives'
// data → window.__pyreonData (live, no reload); page calls window.pyreonPostMessage(x) → onMessage
<WebView html={CHART_HTML} data={metrics()} onMessage={(m) => selected.set(m)} />
```

Right for charts/diagrams/editors (self-contained panes you wouldn't reimplement in SwiftUI). Not for core nav/forms/lists — use the native primitives there.

## Gotchas (each has bitten a real build)

- **`<Inline>` does NOT wrap on Android** (it's a `Row`). 5+ buttons overflow + the last becomes untappable. Keep horizontal groups short, or use `<Stack>` (vertical) for action lists.
- **No `Double` confusion**: a fractional literal (`signal(9.99)`) infers `Double`; `/` always yields a float now. Integer signals stay `Int`.
- **`useLoaderData<T>()`** reads a route `loader: () => …` (zero-param, expression body) auto-fired on navigation.
- Escape hatches for genuinely-per-platform UI: `<Web>` / `<NativeIOS>` / `<NativeAndroid>`.

## Minimal correct multiplatform app (copy this shape)

```tsx
import { Stack, Inline, Text, Heading, Button, Field, Toggle } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'

type Todo = { id: number; title: string; done: boolean }   // type alias, NOT interface

export function App() {
  const todos = signal<Todo[]>([])
  const draft = signal('')
  const remaining = computed(() => todos().filter((t) => !t.done).length)

  const add = () => {
    if (draft() === '') return
    todos.set([...todos(), { id: todos().length, title: draft(), done: false }])
    draft.set('')
  }

  return (
    <Stack gap="md" padding={4}>
      <Heading>Todos ({remaining()} left)</Heading>
      <Inline gap="sm">
        <Field value={draft()} onChangeText={(t) => draft.set(t)} />
        <Button onPress={add}>Add</Button>
      </Inline>
      <For each={todos()} by={(t) => t.id}>
        {(t) => (
          <Inline gap="sm">
            <Toggle value={t.done} onChange={(v) => todos.set(todos().map((x) => x.id === t.id ? { ...x, done: v } : x))} />
            <Text>{t.title}</Text>
          </Inline>
        )}
      </For>
    </Stack>
  )
}
```

This compiles to web + iOS + Android from one source: canonical primitives, a `type`-alias struct, signals, `<For>` keyed list, `.filter`/`.map`, a multi-statement handler — every piece inside the supported subset.
