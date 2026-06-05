---
title: PMTC Supported TypeScript Surface
---

# PMTC Supported TypeScript Surface

> **Status:** Phase D follow-up of the [2026-06 native readiness audit](https://github.com/pyreon/pyreon/blob/main/.claude/audits/native-readiness-2026-06-02.md). Scout-8 scored this surface 18/100 — the lowest of any item — because there was no enumeration of what TS shapes PMTC accepts, drops, or warns on. This page closes that gap.

The Pyreon Multi-Target Compiler (PMTC) intercepts JSX + TypeScript source in your `.tsx` files and emits Swift (SwiftUI) and Kotlin (Compose). It does **not** compile arbitrary TypeScript — Phase 0 deliberately ships a focused subset that covers the seven canonical patterns the TodoMVC + native-counter examples exercise. This page enumerates exactly what works, what silently drops, what fires a warning, and what's planned.

If you hit a shape this page doesn't list, treat it as undefined behavior — file an issue with the source snippet so the matrix can grow.

## The accepted-shape catalogue

### ✅ Type aliases

```ts
type Todo = { id: number; text: string; done: boolean }
type Filter = 'all' | 'active' | 'completed'
```

| Shape | Status | Notes |
|---|---|---|
| Inline object type alias (`type X = { a: T; b: U }`) | ✅ Full | Emitted as `struct` (Swift) / `data class` (Kotlin) |
| Union of string literals (`type X = 'a' \| 'b'`) | ✅ Full | Emitted as `enum` on both targets |
| Aliased primitive (`type Id = number`) | 🟡 Skipped | Falls through silently when the alias is a primitive; consumer code uses the underlying type directly |
| Union with non-string-literal members | 🟡 Skipped | Falls through silently when the alias contains a non-literal union member |
| Generic type aliases (`type Box<T> = …`) | ❌ Phase 3 | Generic type parameters are explicitly skipped |
| Empty object type (`type X = {}`) | ❌ Skipped + warning | "Struct X: skipped — empty object type." |
| Empty string in union branch | ❌ Skipped + warning | "Enum X: skipped empty-string union branch." |

### ✅ Module-level bindings

```ts
let nextId = 1
const TAX_RATE = 0.08
```

| Shape | Status | Notes |
|---|---|---|
| `let x = literal` at module scope | ✅ Full | Emitted as `private var x = …` (Swift) / `var x = …` (Kotlin); module-level mutable state |
| `const x = literal` at module scope | ✅ Full | Emitted as `private let x = …` / `val x = …` |
| Module-level call expressions (`const x = makeThing()`) | 🟡 Skipped | Falls through silently unless the callee is a recognised hook (signal/computed/etc.) |
| `export const x = …` | ✅ Full | Same as the unexported form; export keyword tolerated |

### ✅ Functional components

```tsx
export function Greeting(props: { title: string; count: number }) {
  return <Stack><Text>{props.title}: {props.count}</Text></Stack>
}
```

| Shape | Status | Notes |
|---|---|---|
| `function Comp(props: { … })` | ✅ Full | The canonical shape |
| `const Comp = (props: { … }) => …` | ✅ Full | Arrow form supported |
| `function Comp(props)` (untyped) | ❌ Warning | `Component X has an untyped 'props' parameter — type-annotate it (e.g. function X(props: { title: string }))` — PR #1136. Without annotation, member access (`props.X`) silently drops. |
| `function Comp({ a, b }: { a: string; b: number })` (destructured) | 🟡 Skipped | The destructured-param shape bails earlier in `parseProps` — no warning yet (planned). |
| `export default function Comp(props)` | ✅ Full | Default export supported |
| Component with no `return` statement | ❌ Warning | "Component X: no return statement found; skipping." |
| Component returning a fragment (`<>…</>`) | 🟡 Phase 1+ | Limited — single root element preferred |

### ✅ Hooks (component-body declarations)

The compiler recognises these hook identifiers and emits per-target equivalents:

| Hook | Shape supported | Target emit |
|---|---|---|
| `signal<T>(initial)` | `const x = signal(0)` / `signal<string>('')` | `@State` (Swift) / `var x by remember { mutableStateOf(…) }` (Kotlin) |
| `computed(() => expr)` | `const c = computed(() => a() + b())` | Computed property (Swift) / `derivedStateOf` (Kotlin) |
| `useStorage<T>('key', default)` | Persistent signal | `@PyreonAppStorage` (Swift) / `rememberPyreonStorage` (Kotlin) |
| `useFetch<T>('/url')` | URLSession/ktor wrapper | `PyreonFetch<T>` runtime container |
| `useForm({ initialValues })` | Form-state container | `PyreonForm` runtime container — `initialValues` must be a literal object map |
| `useOnline()` | Network-status signal | `PyreonNetworkStatus` container |
| `usePermissions(['perm.X', 'perm.Y'])` | RBAC bridge | `PyreonPermissions` container; identifier args silently dropped — only string literals captured |
| `useClipboard()` | Clipboard container | `PyreonClipboard` container |
| `useColorScheme()` | Reactive light/dark | `@Environment(\.colorScheme)` (Swift) / `isSystemInDarkTheme()` (Kotlin) |

#### Hooks: silent-drop shapes

- `useStorage<unknown>('k', '')` (no inferred type) — silently emits unbound `T`. Always pass the generic.
- `useFetch('/url')` without a generic — silently drops the decode type; emit may compile but `result.data` is `Unknown`.
- `useForm({ initialValues: x })` where `x` is not a literal object — silently dropped. Use `useForm({ initialValues: { foo: 0 } })`.
- `usePermissions([myString])` where `myString` is an identifier — silently dropped. Pass string literals or migrate to runtime `permissions.set()`.

#### Hooks: warning shapes (PR #1136, A3)

- `useLoaderData<T>()` — **A3 diagnostic** (PR #1235). Emits a warning naming the binding because PMTC has no emit yet; the runtime `PyreonRouter.setLoaderData()` is the only way to populate this signal today. (Real emit lands as Phase B.6.)
- `const { copy, copied } = useClipboard()` — destructure form unsupported; warns to use `const cb = useClipboard()` instead.

### ✅ Function declarations

```ts
function deleteAt(index: number) { items.value.splice(index, 1) }
```

| Shape | Status | Notes |
|---|---|---|
| `const fn = (a, b) => expr` | ✅ Full | Expression-body arrow |
| `const fn = (a, b) => { ... }` | ✅ Full | Block-body arrow |
| `function fn(a, b) { ... }` | ✅ Full | Function declaration (PR landed Round-1) |
| `async function` / `async () => …` | 🟡 Phase 1 | Async body must be inside a recognised effect hook |
| Default parameters (`function fn(a = 1)`) | 🟡 Phase 2 | May silently drop the default value |
| Rest parameters (`function fn(...args)`) | ❌ Unsupported | Silent drop |

### ✅ Reactive prop access

```tsx
function Foo(props: { title: string; count: number }) {
  return <Text>{props.title}: {props.count}</Text>
}
```

The `props.X` member access is rewritten per target. **The annotation type is the source of truth** — `props.unknown` (a field not in the annotation) silently emits an unbound reference. Always type-annotate.

| Shape | Status | Notes |
|---|---|---|
| `props.fieldName` for an annotated field | ✅ Full | Rewritten to platform-native field |
| `props.fieldName` for an UN-annotated field | ❌ Silent drop | Field not in annotation = parser doesn't know about it. No warning at this granularity (only for the parent — see "untyped props parameter" above) |
| Destructure (`const { title } = props`) | 🟡 Skipped | Falls through silently — not yet emitted; use `props.title` directly |
| Spread attributes (e.g. `Child` element with `{...props}`) | ❌ Unsupported | Silently dropped (the spread attribute is ignored; explicit attrs win) |

### ✅ Routing

```tsx
const router = createRouter({
  routes: [
    { path: '/', component: HomePage },
    { path: '/users/:id', component: UserPage, beforeEnter: () => isAuthed() },
  ],
  beforeEach: [authGuard, logGuard],
  afterEach: [analytics],
})
return <RouterProvider router={router}><RouterView /></RouterProvider>
```

| Shape | Status | Notes |
|---|---|---|
| `createRouter({ routes: [...] })` | ✅ Full | Routes extracted; non-literal arrays silently drop |
| `{ path: '/x', component: Identifier }` | ✅ Full | Both fields required; non-literal path silently dropped |
| `beforeEnter: () => expr` (expression-body) | ✅ Full | A5 PR #1242 wired into runtime |
| `beforeEnter: () => { … }` (block-body) | ❌ Warning | PR #1136 — "Per-route beforeEnter is a block-body arrow — only expression-body arrows are extracted; this route emits UNGUARDED." |
| `beforeEach: [identifier, identifier]` | ✅ Full | A4-shipped runtime; identifier args land, inline-arrow args silently dropped |
| `afterEach: [identifier]` | ✅ Full | Same shape as `beforeEach` |
| `children: [...]` | ✅ Full | A4.5 PR #1243 — nested routes with depth-tracked `<RouterView />` |
| `notFoundComponent: Identifier` | ✅ Full | A6 PR #1239 — wildcard-404 fallback |
| `redirect: '/login'` | 🟡 Phase B6 | Not yet extracted; use `router.redirect('/login')` at runtime |
| `meta: {...}` / `name: 'x'` | ❌ Silently ignored | Documented as Phase B+ — extra fields drop without diagnostic |
| `loader: async ({ params }) => …` | ❌ Silently ignored | Compiler skips the field; runtime `useLoaderData<T>()` fires A3 diagnostic instead. Real emit = Phase B6. |

### ✅ JSX

```tsx
<Stack space="md">
  <Text>Hello {name}</Text>
  <For each={items} by={(i) => i.id}>{(item) => <Text>{item.text}</Text>}</For>
</Stack>
```

| Shape | Status | Notes |
|---|---|---|
| Canonical primitive element (`<Stack>` etc — all 15) | ✅ Full | Per target via `canonical-primitives.ts` SWIFT_NAMES / KOTLIN_NAMES |
| Component element (`<UserPage>`) | ✅ Full | Resolved via local function declarations |
| Static text child | ✅ Full | Literal strings, numbers |
| Expression child `{expr}` | ✅ Full | Member access, function calls, signal reads |
| `<For each={…} by={…}>` | ✅ Full | Keyed iteration emit; `by` required (else `each` doesn't typecheck on either target) |
| `<Show when={…}>` | ✅ Full | Gate emit |
| `{...props}` spread | ❌ Silently ignored | The spread is dropped; explicit attrs win |
| Conditional `{cond && <X>}` | ✅ Full | Standard JSX shape |
| Ternary `{cond ? <A /> : <B />}` | ✅ Full | Standard JSX shape |
| Element fragment (`<>…</>`) | 🟡 Phase 1+ | Wrap in `<Stack>` for now |
| Hook calls inside JSX expressions (`<For>{() => { const x = signal(0); …}}` ) | ❌ Warning (PR #1136) | "Hook signal(…) declared inside `<For>` render callback — PMTC only extracts hooks at component-body scope. Lift the declaration to the parent component." |

## Comprehensive silent-drop catalogue

These are shapes the parser walks but doesn't (yet) emit anything for. The compiler doesn't fire a diagnostic — code compiles and runs, but the silently-dropped shape contributes nothing to the native output. Track at `parse.ts` (search "silently" / "drop" / "Phase").

| Shape | Where in `parse.ts` | Why silent | Workaround |
|---|---|---|---|
| Module-level destructured `const { a, b } = obj` | line ~98 | Phase 3 — not enumerated | Use `const a = obj.a; const b = obj.b;` |
| Type alias with non-literal union member | line ~49 | Falls through to "complex" path | Inline the literal members |
| Aliased primitive type | line ~190 | No struct to emit | Use the primitive directly |
| Class declarations | (not handled) | Not in Phase 0 scope | Use function components |
| Module-level non-hook `const x = call()` | line ~501 | Not a recognised pattern | Hoist into a hook the compiler knows |
| Imports beyond known runtime/JSX modules | n/a | Phase 0 doesn't follow imports | Inline used identifiers |
| `function`-declaration inside another function | line ~573 | Not recognised at body scope | Use `const fn = () => …` |
| `useStorage` without explicit generic | line ~520 | No type info to emit | Always pass `useStorage<MyType>(…)` |
| `useForm` without literal `initialValues` | line ~700 | Cannot inspect computed values | Inline the literal `initialValues` |
| `usePermissions` with non-string-literal arg | line ~676 | Identifier value invisible to parser | Pass string literals |
| Route's `loader: async (ctx) => …` field | line ~872 | Loader auto-emit deferred to Phase B6 | Use runtime `router.setLoaderData()` + the A3 diagnostic for `useLoaderData<T>()` |
| Route's `meta`, `name` | line ~862 | Not in v1 scope | Track app-side; use route path as key |
| Inline-arrow guards in `beforeEach`/`afterEach` | line ~597 | Identifier-array parser only | Hoist to named function, then pass identifier |
| Spread attribute on JSX (`<Comp {...props}>`) | (compiler-level) | Phase 2 follow-up | Forward attrs explicitly |
| Block-body `beforeEnter` arrow | line ~862 | A5 wires expression-body only; block-body warns (PR #1136) | Use expression body: `beforeEnter: () => isAuthed()` |
| `useClipboard` destructure | line ~459 | Warns (PR #1136) | Use single-binding shape |

## Diagnostic warnings (already fire today)

These warnings ship in `parse.ts` and surface via `result.warnings` from `@pyreon/native-compiler`'s `transform()`. The CLI builder (`pyreon-native build`) also prints them to stderr.

1. **Untyped props parameter** (PR #1136) — `function X(props) { ... props.title ... }` with no annotation.
2. **`useClipboard` destructure form** (PR #1136) — `const { copy } = useClipboard()`.
3. **Block-body per-route `beforeEnter`** (PR #1136) — `beforeEnter: () => { ... }` (only expression-body arrows are extracted).
4. **Hook inside render callback** (PR #1136) — `<For>{(item) => { const x = signal(0); ... }}`.
5. **Round-1: missing required props** (PR #1094) — `Icon`/`Image`/`Link` without `name`/`src`/`to`.
6. **Round-2: silent-drop shapes** (PR #1099) — `Press` without `onPress`, `Link prefetch=…` on native, `Stack/Inline/Layer align="<typo>"`.
7. **A3: `useLoaderData<T>()`** (PR #1235) — silent-drop diagnostic naming the binding; runtime emit is Phase B6.

## Consuming compiler diagnostics

```ts
import { transform } from '@pyreon/native-compiler'

const result = transform(source, { target: 'swift' })
console.log(result.code)        // emitted Swift
console.log(result.warnings)    // ['Component X has an untyped …', …]
```

The CLI (`pyreon-native build`) prints `[pyreon-native] N warning(s):` to stderr automatically. No Vite-plugin or LSP/editor surfacer exists yet — that's a Phase D6 follow-up.

## What's NOT supported (and not planned for Phase 0)

The audit's Phase B/C/D roadmap explicitly does NOT cover:

- **Class components** — Pyreon's web side hasn't shipped classes either; not a multi-target concern.
- **Hooks rules** (call-from-render-context-only, etc.) — Pyreon doesn't have React's hook rules; the compiler-level constraint is "hook declarations live at component body scope".
- **JSX namespacing** (e.g. `svg:rect` element prefix syntax) — not in v1.
- **Generic type parameters** on user types — explicitly Phase 3 work.
- **Conditional types** (`T extends U ? A : B`) — not parsed; treat as opaque.
- **Decorators** — not in v1.
- **Higher-order components** (HOC pattern) — partially possible if the HOC is just a function returning a component, but the type-flow gets lost.

If you need any of the above, file an issue with the source pattern; the matrix grows from real-world demand.

## Cross-references

- [`packages/native/compiler/src/parse.ts`](https://github.com/pyreon/pyreon/blob/main/packages/native/compiler/src/parse.ts) — source of truth for what gets extracted
- [`packages/native/compiler/src/types.ts`](https://github.com/pyreon/pyreon/blob/main/packages/native/compiler/src/types.ts) — DeclIR + ExprIR union shapes
- [`packages/native/compiler/src/tests/native-audit-warnings.test.ts`](https://github.com/pyreon/pyreon/blob/main/packages/native/compiler/src/tests/native-audit-warnings.test.ts) — locked diagnostic-warning catalogue
- [`docs/docs/multiplatform.md`](https://github.com/pyreon/pyreon/blob/main/docs/docs/multiplatform.md) — the architectural overview
- [`.claude/audits/native-readiness-2026-06-02.md`](https://github.com/pyreon/pyreon/blob/main/.claude/audits/native-readiness-2026-06-02.md) — the audit that drove this enumeration
