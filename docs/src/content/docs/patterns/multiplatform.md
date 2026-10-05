---
title: 'Multiplatform app (one source → web + iOS + Android)'
summary: 'Write ONE .tsx that PMTC compiles to SwiftUI + Compose. Stay inside the supported declarative subset + the 17 canonical primitives. @pyreon/charts (first-party engine, <Chart> + marks) and @pyreon/flow render natively; @pyreon/query lowers ONLY useQuery (+ useStream) — useMutation / useInfiniteQuery / useQueryClient do not; web-only packages (code editor, rich-text, table) run only via a <WebView>. Knowing the boundary is how you build native correctly first-try.'
seeAlso: [routing-setup, state-management, data-fetching]
---

# Multiplatform app (one source → web + iOS + Android)

## The golden rule (read this first)

**PMTC compiles your COMPONENT SOURCE — signals, the 17 canonical primitives, a fixed hook set, and a narrow declarative TS subset — to SwiftUI (iOS) and Jetpack Compose (Android). It does NOT transpile npm packages to native.** So a multiplatform app is built from: the canonical primitives + reactivity + the ported hooks/services, written in the supported TS subset. Anything outside that compiles for web but **silently breaks or drops on native**. Build inside the lane and it works first-try; step outside and it won't.

> Status: native PMTC is **demo-quality, not production-ready**. The one authoritative number is the gated capability matrix in [multiplatform.md](../multiplatform) (`check-multiplatform-matrix` fails CI when its headline disagrees with its table) — do not quote a score from memory. Per-PR validation compiles every emitted fixture with `swiftc` (typecheck against stubs, plus the real SDK on macOS) and `kotlinc`-against-stubs; the iOS/Android device builds of the gated example apps are required checks, so a capability no gated app exercises ships on stub-typecheck strength. Treat the rules below as hard constraints, not suggestions.

## Imports — the canonical layer

```tsx
import { Stack, Inline, Text, Heading, Button, Press, Field, Toggle,
         Image, Icon, Link, Scroll, Layer, Spacer, Modal } from '@pyreon/primitives'
import { signal, computed, effect } from '@pyreon/reactivity'
```

Use **`@pyreon/primitives`** (the multiplatform layer), NOT `@pyreon/elements` / `@pyreon/ui-components` (those are web-only, CSS-in-JS-coupled). The 17 canonical primitives below are the native UI vocabulary, alongside `<Transition>`/`<TransitionGroup>`, `<WebView>` and the `<Web>`/`<NativeIOS>`/`<NativeAndroid>` escape hatches (full per-primitive reference: [primitives](/docs/primitives)):

| Primitive | Web | iOS | Android | Notes |
|---|---|---|---|---|
| `<Stack>` | flex column | `VStack` | `Column` | `direction?="column"\|"row"`, `gap`, `align` |
| `<Inline>` | flex row | `HStack` | `Row` | sugar for `<Stack direction="row">`. **⚠ does NOT wrap** — see gotchas |
| `<Layer>` | relative grid | `ZStack` | `Box` | stacked children (on web, overlap needs `position:absolute`) |
| `<Scroll>` | scroll container | `ScrollView` | `verticalScroll` Column | |
| `<Spacer>` | flex spacer | `Spacer` | `Spacer(Modifier.weight)` | |
| `<Text>` / `<Heading>` | `<span>`/`<h*>` | `Text` | `Text` | |
| `<Button onPress>` | `<button>` | `Button` | `Button` | styled CTA |
| `<Press onPress>` | `<div role=button>` | `Button {}` | `Box(clickable)` | unstyled tap target |
| `<Field value onChangeText>` | `<input>` | `TextField` | `TextField` | |
| `<Toggle>` | checkbox | `Toggle` | `Switch` | |
| `<Image>` / `<Icon>` | `<img>`/svg | `Image`/SF Symbol | `AsyncImage`/`Icon` | |
| `<Video>` / `<Audio>` | `<video>`/`<audio>` | `PyreonVideoPlayer`/`PyreonAudioPlayer` | same | `<Audio>` has no visible UI |
| `<Link>` | `<a href>` | `PyreonLink` | `PyreonLink` | router-agnostic on web (`init({ navigate })`); pushes onto the native router |
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

Also lowering today (each verified against real `swiftc`/`kotlinc`): object-shape `interface` declarations (synthesized into structs like a `type` alias), `Map`/`Set`, `Date.now()`, template literals, optional chaining, destructuring of local arrays/objects, and fractional math. The live per-construct status is in [multiplatform.md](../multiplatform).

**Outside it, the compiler now WARNS by name (read the warning — it names the fix) instead of dropping silently:**

| Don't (warned, or breaks the native build) | Do instead |
|---|---|
| TS `enum Color { … }` | `type Color = 'red' \| 'green'` (string-literal union) |
| `class Foo { … }` | functions + signals (or `defineStore` / `model()`) |
| a GENERIC or `extends` `interface` | a plain object-shape `type` alias |
| `try` / `throw`, `JSON.parse` | `useFetch<T>` (typed decode) — `JSON.stringify(x)` DOES lower |
| regex literals, computed object keys, call-argument spreads | string methods, plain keys, explicit arguments |
| `for` / `while` / `switch` / `try` statements at a component-body top level | `.map` / `.filter`, `<For>`, ternary, `<Show>` |
| JSX spread on a canonical primitive (`<Stack {...rest}>`) | pass the props explicitly |
| destructured props `function C({ x }) {}` | `function C(props) { … props.x … }` (destructure loses reactivity) |
| a bare object literal whose field PMTC cannot type (`{ nodes, edges: [] }`, a `null` field) | annotate it: `const g: Graph = { … }` / `signal<Graph>({ … })` |

Do not rely on the absence of a warning as proof it compiles: run `pyreon doctor --check-native` (project scan) or the MCP `validate` tool (per-snippet) before the device build.

## Per-target hooks + services (these DO work on native)

```tsx
import { useStorage } from '@pyreon/storage'      // → @PyreonAppStorage / rememberPyreonStorage
import { useFetch } from '@pyreon/hooks'           // → PyreonFetch (URLSession / ktor)
import { useForm } from '@pyreon/form'             // → PyreonForm (device-proven)
import { usePermissions } from '@pyreon/permissions'
import { defineStore } from '@pyreon/store'        // → PyreonStore
import { useNavigate, useParams, useLoaderData } from '@pyreon/router'
```

Native-ported: reactivity, the 17 canonical primitives, `store`, `machine`, `state-tree`, `i18n`, `form`, `permissions`, `storage`, `charts`, `flow`, the router (nested routes, `beforeEnter`, per-route `loader`), and a fixed subset of `@pyreon/hooks` (`useFetch`, `useOnline`, `useClipboard`, `useColorScheme`, `useAppState`, plus device hooks such as `useGeolocation` / `useShare` / `useWakeLock`). The authoritative lowered-hook list is `NATIVE_LOWERED_HOOKS` in `packages/native/compiler/src/parse.ts`; a hook outside it warns that it has no native lowering.

## Data on native: `useFetch` vs `useQuery`

`@pyreon/query` is NOT web-only wholesale — its manifest tier is `web-only` because the full TanStack client stays on the web, but **`useQuery` lowers to a native `PyreonQuery`** (a keyed, stale-while-revalidate cache with `isPending` / `isFetching` / `data` / `error`), and `useStream` over `@pyreon/http/stream` lowers to `PyreonStream` (SSE + NDJSON). The rest of the package does not:

| Construct | Native |
|---|---|
| `useQuery<T>(() => ({ queryKey, queryFn, staleTime }))` | ✅ lowers (see the exact shape below) |
| `useQuery(() => endpoint.query({ params }))` over a same-file `@pyreon/http` endpoint | ✅ lowers; a runtime `:param` re-fetches when the value changes |
| `new QueryClient()` / `<QueryClientProvider>` | ✅ accepted and emits nothing (the native query holds its own state), so one shared source still builds |
| `useStream` over `@pyreon/http/stream` | ✅ lowers to `PyreonStream` |
| `useMutation`, `useInfiniteQuery`, `useQueryClient`, `useQueries`, `useSuspenseQuery`, query persistence/devtools | ❌ no native lowering — the compiler warns by name; call them only behind `<Web>` or hand-roll from signals + `useFetch` |

`useQuery` native shape (anything else warns and bails rather than mis-lowering):

```tsx
import { Stack, Text } from '@pyreon/primitives'
import { useQuery } from '@pyreon/query'

type Todo = { id: number; title: string }

export function TodoPage() {
  // - the response type argument is REQUIRED (without it iOS decodes into `Any`, which does not compile)
  // - options are a FUNCTION returning an object literal
  // - queryKey: an array of string/number literals or expressions (colon-joined into the cache key)
  // - queryFn: inline `() => fetch('<url>').then(r => r.json())` (literal or template URL)
  // - staleTime: a number literal in ms
  const q = useQuery<Todo>(() => ({
    queryKey: ['todo', 1],
    queryFn: () => fetch('https://api.example.com/todos/1').then((r) => r.json()),
    staleTime: 60000,
  }))
  return (
    <Stack gap="sm">
      <Text>{q.isPending}</Text>
      <Text>{q.data}</Text>
    </Stack>
  )
}
```

For a one-shot load with no cache, `useFetch<T>(url)` is simpler (it also needs `<T>` on iOS). `useFetch` lowers to a ONE-SHOT task, so a runtime path parameter there stays web — use `useQuery` when the URL depends on a signal or prop.

## Charts and diagrams on native

`@pyreon/charts` is first-party and **renders natively** — there is no WebView and no ECharts. The engine is generated into the native runtimes and `<Chart>` + its marks (and the family components) draw as a native canvas over the same draw list the web uses:

```tsx
import { Axis, Chart, Legend, Line, Tooltip } from '@pyreon/charts'
import { signal } from '@pyreon/reactivity'

type Row = { month: string; revenue: number }

export function Revenue() {
  const rows = signal<Row[]>([{ month: 'Jan', revenue: 12 }, { month: 'Feb', revenue: 18 }])
  return (
    <Chart data={rows} x="month" height={240}>
      <Line y="revenue" label="Revenue" />
      <Axis y />
      <Tooltip />
      <Legend position="bottom" />
    </Chart>
  )
}
```

The package exports `.`, `./svg` and `./engine` (there is no separate plot subpath and no ECharts facade — import everything from the package root). A few web-only members (the map registry, raw GeoJSON) warn by name. See `get_api({ package: "charts", symbol: "Chart" })`. `@pyreon/flow` likewise lowers natively (`createFlow` / `<Flow>`); its unchanged DOM renderer is available through `@pyreon/flow/webview`.

## Web-only packages — only via a `<WebView>` bridge

These can NOT be native-rendered (they're bound to DOM/vendors): **`@pyreon/code`** (CodeMirror — its `/webview` subpath hosts it), **`@pyreon/rich-text`**, **`@pyreon/dnd`** (list reorder lowers; the DOM drag hooks do not), **`@pyreon/document`**, **`@pyreon/table`** / **`@pyreon/virtual`**, and the whole CSS-in-JS UI stack (`elements`/`styler`/`rocketstyle`/`coolgrid`/`kinetic`). The per-package rationale is the `multiplatform` field of each package's manifest, rendered in the [multiplatform libraries](../multiplatform-libraries) table.

You CAN still use them — host the web component in a **`<WebView>`** (a real browser engine) with the bidirectional bridge:

```tsx
import { WebView } from '@pyreon/primitives'
// data → window.__pyreonData (live, no reload); page calls window.pyreonPostMessage(x) → onMessage
<WebView html={EDITOR_HTML} data={doc()} onMessage={(m) => selected.set(m)} />
```

Right for editors/document previews (self-contained panes you wouldn't reimplement in SwiftUI). Not for core nav/forms/lists — use the native primitives there.

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

## Anti-pattern

Reaching outside the multiplatform lane — the native build breaks (the compiler warns by name for most of these; run `pyreon doctor --check-native`):

```tsx
// ❌ DON'T — every line here breaks the native (iOS/Android) build:
import { Card, Button } from '@pyreon/ui-components'  // web-only CSS-in-JS — won't render native
import { CodeEditor } from '@pyreon/code'             // CodeMirror (DOM) — web-only, host it in a <WebView>
import { useMutation } from '@pyreon/query'           // no native lowering (only useQuery lowers) — warns by name
enum Status { Open, Done }                            // enum — out of the subset, warns
class TodoStore { items = [] }                        // class — out of the subset, warns

function Dashboard({ title }: { title: string }) {    // destructured prop loses reactivity
  const data = { count: 0 }                           // bare local object literal — dropped on native
  const pct = data.count / total                      // (web `/` is float; native truncates unless coerced — fixed in-compiler)
  return <Card>{`Hits: ${title}`}</Card>              // template literal partially-supported on native; <Card> is web-only
}
```

```tsx
// ✅ DO — stay in the lane (or bridge):
import { Stack, Text, Button } from '@pyreon/primitives'  // multiplatform UI
import { signal } from '@pyreon/reactivity'
type Todo = { id: number }                                // object-shape type → struct on native
function Dashboard(props: { title: string }) {            // props.x stays reactive
  const count = signal(0)                                 // reactive state, not a bare object
  return <Stack><Text>{'Hits: ' + props.title}</Text></Stack>
}
// Charts work natively: import { Chart } from '@pyreon/charts'. A code editor? Host it: <WebView html={EDITOR_HTML} data={doc()} onMessage={...} />
```

Catch these BEFORE the device build with `pyreon doctor --check-native` (project scan) or the MCP `validate` tool (per-snippet) — both flag web-only imports + out-of-subset `enum`/`class` in files importing `@pyreon/primitives`.

## Related

- `get_pattern({ name: "routing-setup" })` — the router works on native (nested routes, `beforeEnter`, `loader`); `useNavigate`/`useParams`/`useLoaderData` emit per target.
- `get_pattern({ name: "state-management" })` — `defineStore` / `@pyreon/store` is native-ported.
- `get_pattern({ name: "data-fetching" })` — on native, `useFetch` and `useQuery` (the keyed shape above) lower; `useMutation` / `useInfiniteQuery` do not.
- `get_api({ package: "primitives", symbol: "Stack" })` (and the other canonical primitives + `WebView`) — per-primitive props, per-target mapping, and gotchas.
