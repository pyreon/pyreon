/**
 * Pyreon API reference database — structured documentation for every public export.
 * Used by the MCP server's get_api tool and the llms.txt generator.
 *
 * Format: "package/symbol" → { signature, example, notes?, mistakes? }
 */

export interface ApiEntry {
  signature: string
  example: string
  notes?: string
  mistakes?: string
}

export const API_REFERENCE: Record<string, ApiEntry> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/reactivity
  // ═══════════════════════════════════════════════════════════════════════════

  'reactivity/signal': {
    signature: 'signal<T>(initialValue: T, options?: { name?: string }): Signal<T>',
    example: `const count = signal(0)

// Read (subscribes to updates):
count()          // 0

// Write:
count.set(5)     // sets to 5

// Update:
count.update(n => n + 1)  // 6

// Read without subscribing:
count.peek()     // 6`,
    notes:
      'Signals are callable functions, NOT .value getters. Components run once — signal reads in JSX auto-subscribe. Optional { name } for debugging — auto-injected by @pyreon/vite-plugin in dev mode.',
    mistakes: `- \`count.value\` → Use \`count()\` to read
- \`{count}\` in JSX → Use \`{count()}\` to read (or let the compiler wrap it)
- \`const [val, setVal] = signal(0)\` → Not destructurable. Use \`const val = signal(0)\``,
  },

  'reactivity/computed': {
    signature:
      'computed<T>(fn: () => T, options?: { equals?: (a: T, b: T) => boolean }): Computed<T>',
    example: `const count = signal(0)
const doubled = computed(() => count() * 2)

doubled()  // 0
count.set(5)
doubled()  // 10`,
    notes:
      'Dependencies auto-tracked. No dependency array needed. Memoized — only recomputes when dependencies change.',
    mistakes: `- \`computed(() => count)\` → Must call signal: \`computed(() => count())\`
- Don't use for side effects — use effect() instead`,
  },

  'reactivity/effect': {
    signature: 'effect(fn: () => (() => void) | void): () => void',
    example: `const count = signal(0)

// Auto-tracks count() dependency:
const dispose = effect(() => {
  console.log("Count is:", count())
})

// With onCleanup:
effect(() => {
  const handler = () => console.log(count())
  window.addEventListener("resize", handler)
  onCleanup(() => window.removeEventListener("resize", handler))
})

// Or return cleanup (also works):
effect(() => {
  const handler = () => console.log(count())
  window.addEventListener("resize", handler)
  return () => window.removeEventListener("resize", handler)
})`,
    notes:
      'Returns a dispose function. Dependencies auto-tracked on each run. Use onCleanup() inside to register cleanup that runs before re-execution. For DOM-specific effects, use renderEffect().',
    mistakes: `- Don't pass a dependency array — Pyreon auto-tracks
- \`effect(() => { count })\` → Must call: \`effect(() => { count() })\``,
  },

  'reactivity/onCleanup': {
    signature: 'onCleanup(fn: () => void): void',
    example: `effect(() => {
  const handler = () => console.log(count())
  window.addEventListener("resize", handler)
  onCleanup(() => window.removeEventListener("resize", handler))
})`,
    notes:
      'Registers a cleanup function inside an effect. Runs between re-executions (before the effect re-runs) and when the effect is disposed.',
    mistakes: `- Using onCleanup outside an effect — it only works inside effect() or renderEffect()
- Confusing with onUnmount — onCleanup is for effects, onUnmount is for components`,
  },

  'reactivity/batch': {
    signature: 'batch(fn: () => void): void',
    example: `const a = signal(1)
const b = signal(2)

// Updates subscribers only once:
batch(() => {
  a.set(10)
  b.set(20)
})`,
    notes: 'Defers all signal notifications until the batch completes. Nested batches are merged.',
  },

  'reactivity/createStore': {
    signature: 'createStore<T extends object>(initialValue: T): T',
    example: `const store = createStore({
  user: { name: "Alice", age: 30 },
  items: [1, 2, 3]
})

// Granular reactivity — only rerenders what changed:
store.user.name = "Bob"  // only name subscribers fire
store.items.push(4)      // only items subscribers fire`,
    notes:
      'Deep proxy — nested objects are automatically reactive. Use reconcile() for bulk updates.',
  },

  'reactivity/createResource': {
    signature:
      'createResource<T>(fetcher: () => Promise<T>, options?: ResourceOptions): Resource<T>',
    example: `const users = createResource(() => fetch("/api/users").then(r => r.json()))

// In JSX:
<Show when={!users.loading()}>
  <For each={users()} by={u => u.id}>
    {user => <li>{user.name}</li>}
  </For>
</Show>`,
    notes:
      'Integrates with Suspense. Access .loading(), .error(), and call resource() for the value.',
  },

  'reactivity/untrack': {
    signature: 'untrack<T>(fn: () => T): T',
    example: `import { untrack } from "@pyreon/reactivity"

// Read signals without subscribing:
effect(() => {
  const name = untrack(() => userName())
  console.log("Count changed:", count(), "user is", name)
})`,
    notes:
      'Alias for runUntracked. Reads signals inside fn without adding them as dependencies of the current effect/computed.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/core
  // ═══════════════════════════════════════════════════════════════════════════

  'core/h': {
    signature:
      'h<P>(type: ComponentFn<P> | string | symbol, props: P | null, ...children: VNodeChild[]): VNode',
    example: `// Usually use JSX instead:
const vnode = h("div", { class: "container" },
  h("h1", null, "Hello"),
  h(Counter, { initial: 0 })
)`,
    notes: 'Low-level API. Prefer JSX which compiles to h() calls (or _tpl() for templates).',
  },

  'core/Fragment': {
    signature: 'Fragment: symbol',
    example: `// JSX:
<>
  <h1>Title</h1>
  <p>Content</p>
</>

// h() API:
h(Fragment, null, h("h1", null, "Title"), h("p", null, "Content"))`,
  },

  'core/onMount': {
    signature: 'onMount(fn: () => CleanupFn | void): void',
    example: `const Timer = () => {
  const count = signal(0)

  onMount(() => {
    const id = setInterval(() => count.update(n => n + 1), 1000)
    return () => clearInterval(id)  // cleanup
  })

  return <div>{count()}</div>
}`,
    notes: 'Optionally return a cleanup function that runs on unmount.',
    mistakes: `- Forgetting cleanup: \`onMount(() => { const id = setInterval(...) })\` → Return cleanup: \`onMount(() => { const id = setInterval(...); return () => clearInterval(id) })\``,
  },

  'core/onUnmount': {
    signature: 'onUnmount(fn: () => void): void',
    example: `onUnmount(() => {
  console.log("Component removed from DOM")
})`,
  },

  'core/createContext': {
    signature: 'createContext<T>(defaultValue: T): Context<T>',
    example: `const ThemeContext = createContext<"light" | "dark">("light")

// Provide:
const App = () => {
  provide(ThemeContext, "dark")
  return <Child />
}

// Consume:
const Child = () => {
  const theme = useContext(ThemeContext)
  return <div class={theme}>...</div>
}`,
  },

  'core/useContext': {
    signature: 'useContext<T>(ctx: Context<T>): T',
    example: `const theme = useContext(ThemeContext)  // returns provided value or default`,
  },

  'core/provide': {
    signature: 'provide<T>(ctx: Context<T>, value: T): void',
    example: `const ThemeCtx = createContext<"light" | "dark">("light")

function App() {
  provide(ThemeCtx, "dark")
  return <Child />
}`,
    notes:
      'Pushes a context value and auto-cleans up on unmount. Preferred over manual pushContext/popContext. Must be called during component setup.',
  },

  'core/ExtractProps': {
    signature: 'type ExtractProps<T> = T extends ComponentFn<infer P> ? P : T',
    example: `const Greet: ComponentFn<{ name: string }> = ({ name }) => <h1>{name}</h1>

type Props = ExtractProps<typeof Greet>
// { name: string }`,
    notes:
      'Extracts the props type from a ComponentFn. Passes through unchanged if T is not a ComponentFn.',
  },

  'core/HigherOrderComponent': {
    signature: 'type HigherOrderComponent<HOP, P> = ComponentFn<HOP & P>',
    example: `function withLogger<P>(Wrapped: ComponentFn<P>): HigherOrderComponent<{ logLevel?: string }, P> {
  return (props) => {
    console.log(\`[\${props.logLevel ?? "info"}] Rendering\`)
    return <Wrapped {...props} />
  }
}`,
    notes:
      "Typed HOC pattern — HOP is the props the HOC adds, P is the wrapped component's own props.",
  },

  'core/For': {
    signature: '<For each={items} by={keyFn}>{renderFn}</For>',
    example: `const items = signal([
  { id: 1, name: "Apple" },
  { id: 2, name: "Banana" },
])

<For each={items()} by={item => item.id}>
  {item => <li>{item.name}</li>}
</For>`,
    notes: "Uses 'by' prop (not 'key') because JSX extracts 'key' as a special VNode prop.",
    mistakes: `- \`<For each={items}>\` → Must call signal: \`<For each={items()}>\`
- \`<For each={items()} key={...}>\` → Use \`by\` not \`key\`
- \`{items().map(...)}\` → Use <For> for reactive list rendering`,
  },

  'core/Show': {
    signature: '<Show when={condition} fallback={alternative}>{children}</Show>',
    example: `<Show when={isLoggedIn()} fallback={<LoginForm />}>
  <Dashboard />
</Show>`,
    notes:
      'More efficient than ternary for signal-driven conditions. Only mounts/unmounts when condition changes.',
  },

  'core/Suspense': {
    signature: '<Suspense fallback={loadingUI}>{children}</Suspense>',
    example: `const LazyPage = lazy(() => import("./HeavyPage"))

<Suspense fallback={<div>Loading...</div>}>
  <LazyPage />
</Suspense>`,
  },

  'core/lazy': {
    signature:
      'lazy(loader: () => Promise<{ default: ComponentFn }>, options?: LazyOptions): LazyComponent',
    example: `const Settings = lazy(() => import("./pages/Settings"))

// Use in JSX (wrap with Suspense):
<Suspense fallback={<Spinner />}>
  <Settings />
</Suspense>`,
  },

  'core/Dynamic': {
    signature: '<Dynamic component={comp} {...props} />',
    example: `const components = { home: HomePage, about: AboutPage }
const current = signal("home")

<Dynamic component={components[current()]} />`,
  },

  'core/ErrorBoundary': {
    signature: '<ErrorBoundary onCatch={handler} fallback={errorUI}>{children}</ErrorBoundary>',
    example: `<ErrorBoundary
  onCatch={(err) => console.error(err)}
  fallback={(err) => <div>Error: {err.message}</div>}
>
  <App />
</ErrorBoundary>`,
  },

  'core/cx': {
    signature: 'cx(...values: ClassValue[]): string',
    example: `import { cx } from "@pyreon/core"

cx("foo", "bar")                         // "foo bar"
cx("base", isActive && "active")         // conditional
cx({ base: true, active: isActive() })   // object syntax
cx(["a", ["b", { c: true }]])            // nested arrays

// class prop accepts ClassValue directly:
<div class={["base", cond && "active"]} />
<div class={{ base: true, active: isActive() }} />`,
    notes:
      'Combines class values into a single string. Accepts strings, booleans, objects, arrays (nested). Falsy values are ignored. ClassValue type is also exported from @pyreon/core.',
    mistakes: `- \`class={cx(...)}\` works but is redundant — class prop already accepts ClassValue
- \`class={condition ? "a" : undefined}\` → Use \`class={[condition && "a"]}\` or \`class={{ a: condition }}\``,
  },

  'core/splitProps': {
    signature: 'splitProps<T, K extends keyof T>(props: T, keys: K[]): [Pick<T, K>, Omit<T, K>]',
    example: `import { splitProps } from "@pyreon/core"

const Button = (props: { class?: string; onClick: () => void; children: VNodeChild }) => {
  const [local, rest] = splitProps(props, ["class"])
  return <button {...rest} class={cx("btn", local.class)} />
}`,
    notes:
      'Splits a props object into two: picked keys and the rest. Preserves signal reactivity on both halves.',
    mistakes: `- Destructuring props directly breaks reactivity — use splitProps instead
- \`const { class: cls, ...rest } = props\` → \`const [local, rest] = splitProps(props, ["class"])\``,
  },

  'core/mergeProps': {
    signature: 'mergeProps<T extends object[]>(...sources: T): MergedProps<T>',
    example: `import { mergeProps } from "@pyreon/core"

const Button = (props: { size?: string; variant?: string }) => {
  const merged = mergeProps({ size: "md", variant: "primary" }, props)
  return <button class={\`btn-\${merged.size} btn-\${merged.variant}\`} />
}`,
    notes:
      'Merges multiple props objects. Last source wins for each key. Preserves reactivity — reads are lazy.',
  },

  'core/createUniqueId': {
    signature: 'createUniqueId(): string',
    example: `import { createUniqueId } from "@pyreon/core"

const LabeledInput = (props: { label: string }) => {
  const id = createUniqueId()
  return (
    <>
      <label for={id}>{props.label}</label>
      <input id={id} />
    </>
  )
}`,
    notes:
      'Returns a unique string ID ("pyreon-1", "pyreon-2", etc.). SSR-safe — IDs are consistent between server and client when called in the same order.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/router
  // ═══════════════════════════════════════════════════════════════════════════

  'router/createRouter': {
    signature: 'createRouter(options: RouterOptions | RouteRecord[]): Router',
    example: `const router = createRouter([
  { path: "/", component: Home },
  { path: "/user/:id", component: User, loader: ({ params }) => fetchUser(params.id) },
  { path: "/admin", component: Admin, beforeEnter: requireAuth, children: [
    { path: "settings", component: Settings },
  ]},
])`,
  },

  'router/RouterProvider': {
    signature: '<RouterProvider router={router}>{children}</RouterProvider>',
    example: `const App = () => (
  <RouterProvider router={router}>
    <nav><RouterLink to="/">Home</RouterLink></nav>
    <RouterView />
  </RouterProvider>
)`,
  },

  'router/RouterView': {
    signature: '<RouterView />',
    example: `// Renders the matched route's component
<RouterView />

// Nested routes: parent component includes <RouterView /> for children
const Admin = () => (
  <div>
    <h1>Admin</h1>
    <RouterView />  {/* renders Settings, Users, etc. */}
  </div>
)`,
  },

  'router/RouterLink': {
    signature: '<RouterLink to={path} activeClass={cls} exactActiveClass={cls} />',
    example: `<RouterLink to="/" activeClass="nav-active">Home</RouterLink>
<RouterLink to={{ name: "user", params: { id: "42" } }}>Profile</RouterLink>`,
  },

  'router/useRouter': {
    signature: 'useRouter(): Router',
    example: `const router = useRouter()

router.push("/settings")
router.push({ name: "user", params: { id: "42" } })
router.replace("/login")
router.back()
router.forward()
router.go(-2)`,
  },

  'router/useRoute': {
    signature: 'useRoute<TPath extends string>(): () => ResolvedRoute<ExtractParams<TPath>>',
    example: `// Type-safe params:
const route = useRoute<"/user/:id">()
const userId = route().params.id  // string

// Access query, meta, etc:
route().query
route().meta`,
  },

  'router/useSearchParams': {
    signature:
      'useSearchParams<T>(defaults?: T): [get: () => T, set: (updates: Partial<T>) => Promise<void>]',
    example: `const [search, setSearch] = useSearchParams({ page: "1", sort: "name" })

// Read:
search().page  // "1"

// Write:
setSearch({ page: "2" })`,
  },

  'router/useLoaderData': {
    signature: 'useLoaderData<T>(): T',
    example: `// Route: { path: "/user/:id", component: User, loader: ({ params }) => fetchUser(params.id) }

const User = () => {
  const data = useLoaderData<UserData>()
  return <div>{data.name}</div>
}`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/head
  // ═══════════════════════════════════════════════════════════════════════════

  'head/useHead': {
    signature: 'useHead(input: UseHeadInput | (() => UseHeadInput)): void',
    example: `// Static:
useHead({ title: "My Page", meta: [{ name: "description", content: "..." }] })

// Reactive (updates when signals change):
useHead(() => ({
  title: \`\${username()} — Profile\`,
  meta: [{ property: "og:title", content: username() }]
}))`,
  },

  'head/HeadProvider': {
    signature: '<HeadProvider>{children}</HeadProvider>',
    example: `// Client-side setup:
mount(
  <HeadProvider>
    <App />
  </HeadProvider>,
  document.getElementById("app")!
)`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/server
  // ═══════════════════════════════════════════════════════════════════════════

  'server/createHandler': {
    signature: 'createHandler(options: HandlerOptions): (req: Request) => Promise<Response>',
    example: `import { createHandler } from "@pyreon/server"

export default createHandler({
  App,
  routes,
  clientEntry: "/src/entry-client.ts",
  mode: "stream",  // or "string"
})`,
  },

  'server/island': {
    signature:
      'island(loader: () => Promise<ComponentFn>, options: { name: string; hydrate?: HydrationStrategy }): ComponentFn',
    example: `const SearchBar = island(
  () => import("./SearchBar"),
  { name: "SearchBar", hydrate: "visible" }
)

// Hydration strategies: "load" | "idle" | "visible" | "media" | "never"`,
  },

  'server/prerender': {
    signature: 'prerender(options: PrerenderOptions): Promise<PrerenderResult>',
    example: `await prerender({
  handler,
  paths: ["/", "/about", "/blog/1", "/blog/2"],
  outDir: "./dist",
})`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/runtime-dom
  // ═══════════════════════════════════════════════════════════════════════════

  'runtime-dom/mount': {
    signature: 'mount(root: VNodeChild, container: Element): () => void',
    example: `import { mount } from "@pyreon/runtime-dom"

const dispose = mount(<App />, document.getElementById("app")!)

// To unmount:
dispose()`,
    mistakes: `- \`createRoot(container).render(<App />)\` → Use \`mount(<App />, container)\`
- Container must not be null/undefined`,
  },

  'runtime-dom/hydrateRoot': {
    signature: 'hydrateRoot(root: VNodeChild, container: Element): () => void',
    example: `import { hydrateRoot } from "@pyreon/runtime-dom"

// Hydrate server-rendered HTML:
hydrateRoot(<App />, document.getElementById("app")!)`,
  },

  'runtime-dom/Transition': {
    signature: '<Transition name={name} mode={mode}>{children}</Transition>',
    example: `<Transition name="fade" mode="out-in">
  <Show when={visible()}>
    <div>Content</div>
  </Show>
</Transition>

/* CSS:
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s }
.fade-enter-from, .fade-leave-to { opacity: 0 }
*/`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/store
  // ═══════════════════════════════════════════════════════════════════════════

  'store/defineStore': {
    signature: 'defineStore<T>(id: string, setup: () => T): () => StoreApi<T>',
    example: `const useCounter = defineStore('counter', () => {
  const count = signal(0)
  const increment = () => count.update(n => n + 1)
  return { count, increment }
})

const { store } = useCounter()
store.count()      // 0
store.increment()  // reactive update`,
    notes:
      'Composition-style stores. Singleton by ID. Returns StoreApi with .store, .patch(), .subscribe(), .onAction(), .reset(), .dispose().',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/form
  // ═══════════════════════════════════════════════════════════════════════════

  'form/useForm': {
    signature:
      'useForm<T>(options: { initialValues: T, onSubmit: (values: T) => void | Promise<void>, schema?, validateOn?, debounceMs? }): FormInstance<T>',
    example: `const form = useForm({
  initialValues: { name: '', email: '' },
  onSubmit: async (values) => await api.save(values),
  validateOn: 'blur',
})

form.handleSubmit()  // triggers validation + onSubmit
form.reset()         // reset to initial values`,
    notes:
      'Signal-based form state. Use useField() for individual field binding, useFieldArray() for dynamic arrays.',
  },

  'form/useField': {
    signature: 'useField<T>(form: FormInstance<T>, name: keyof T): FieldInstance',
    example: `const name = useField(form, 'name')

<input {...name.register()} />
// name.value(), name.error(), name.hasError(), name.showError()`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/query
  // ═══════════════════════════════════════════════════════════════════════════

  'query/useQuery': {
    signature:
      'useQuery<T>(options: { queryKey: unknown[], queryFn: () => Promise<T>, ... }): { data: Signal<T>, error: Signal<Error>, isFetching: Signal<boolean>, ... }',
    example: `const { data, error, isFetching } = useQuery({
  queryKey: ['users'],
  queryFn: () => fetch('/api/users').then(r => r.json()),
})`,
    notes:
      'TanStack Query adapter. Fine-grained signals per field. Reactive options via function getter. Also: useMutation, useInfiniteQuery, useSuspenseQuery, useSubscription (WebSocket).',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/permissions
  // ═══════════════════════════════════════════════════════════════════════════

  'permissions/createPermissions': {
    signature: 'createPermissions<T extends PermissionMap>(initial?: T): PermissionsInstance',
    example: `const can = createPermissions({
  'posts.read': true,
  'posts.delete': (post) => post.authorId === userId,
  'admin.*': false,
})

can('posts.read')         // true (reactive)
can('posts.delete', post) // evaluates predicate
can.not('admin.dashboard')
can.all('posts.read', 'posts.create')
can.any('admin.users', 'posts.read')`,
    notes:
      "Reactive permissions. Supports RBAC, ABAC, feature flags, subscription tiers. Wildcard matching with '*'. PermissionsProvider/usePermissions for context.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/machine
  // ═══════════════════════════════════════════════════════════════════════════

  'machine/createMachine': {
    signature: 'createMachine<S, E>(config: MachineConfig<S, E>): Machine<S, E>',
    example: `const traffic = createMachine({
  initial: 'red',
  states: {
    red:    { on: { NEXT: 'green' } },
    green:  { on: { NEXT: 'yellow' } },
    yellow: { on: { NEXT: 'red' } },
  },
})

traffic()            // 'red' (reactive)
traffic.send('NEXT') // 'green'
traffic.matches('green') // true
traffic.can('NEXT')  // true`,
    notes:
      'Constrained signal with type-safe transitions. Guards: { target, guard: (payload?) => boolean }. No context — use signals alongside.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/storage
  // ═══════════════════════════════════════════════════════════════════════════

  'storage/useStorage': {
    signature:
      'useStorage<T>(key: string, defaultValue: T, options?: StorageOptions<T>): StorageSignal<T>',
    example: `const theme = useStorage('theme', 'light')
theme()           // 'light'
theme.set('dark') // persists + cross-tab sync
theme.remove()    // delete from storage`,
    notes:
      'localStorage by default. Also: useSessionStorage, useCookie, useIndexedDB, useMemoryStorage, createStorage(backend). All return StorageSignal<T> extending Signal<T> with .remove().',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/i18n
  // ═══════════════════════════════════════════════════════════════════════════

  'i18n/createI18n': {
    signature:
      'createI18n(options: { locale: string, messages: Record<string, Record<string, string>>, loader?, fallbackLocale?, pluralRules? }): I18nInstance',
    example: `// Full entry — includes JSX components (Trans, I18nProvider, useI18n)
import { createI18n, useI18n } from '@pyreon/i18n'

const i18n = createI18n({
  locale: 'en',
  messages: { en: { greeting: 'Hello, {{name}}!' } },
  loader: (locale, ns) => import(\`./locales/\${locale}/\${ns}.json\`),
})

const { t, locale } = useI18n()
t('greeting', { name: 'World' }) // "Hello, World!"
locale.set('fr')                  // switch reactively

// Backend / non-JSX entry — @pyreon/i18n/core
// Zero JSX dependencies, transitively only @pyreon/reactivity.
// Use this on backends, edge workers, non-Pyreon frontends.
import { createI18n } from '@pyreon/i18n/core'
const backendI18n = createI18n({ locale: 'en', messages: { en: { hello: 'Hi' } } })
backendI18n.t('hello')`,
    notes:
      'Interpolation with {{name}}, pluralization with _one/_other suffixes. Namespace lazy loading. <Trans> component for rich JSX interpolation. TWO ENTRY POINTS: `@pyreon/i18n` (full, with JSX components) vs `@pyreon/i18n/core` (framework-agnostic, zero JSX deps — use for backends and non-Pyreon consumers). Both return identical I18nInstance objects.',
    mistakes: `- Using \`@pyreon/i18n\` (the main entry) on a backend without a JSX-aware tsconfig — the bun condition resolves to source which transitively includes the Trans JSX component. Use \`@pyreon/i18n/core\` instead.
- Reading the README example and importing from \`@pyreon/i18n\` in a non-Pyreon project — that path works for Pyreon UIs but the README now documents \`/core\` as the backend recommendation.
- Trying to use \`<Trans>\` from \`@pyreon/i18n/core\` — it's intentionally not exported there. Import it from the main \`@pyreon/i18n\` entry instead.`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/document
  // ═══════════════════════════════════════════════════════════════════════════

  'document/createDocument': {
    signature: 'createDocument(props?: DocumentProps): DocumentBuilder',
    example: `const doc = createDocument({ title: 'Report' })
  .heading('Sales Report')
  .table({ columns: ['Region', 'Revenue'], rows: [['US', '$1M']] })

await doc.toPdf()      // PDF
await doc.toEmail()    // Outlook-safe HTML
await doc.toDocx()     // Word document
await doc.toSlack()    // Slack Block Kit JSON
await doc.toNotion()   // Notion blocks`,
    notes:
      '14+ output formats. JSX primitives: Document, Page, Heading, Text, Table, Image, List, Code, etc. Heavy renderers lazy-loaded.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/flow
  // ═══════════════════════════════════════════════════════════════════════════

  'flow/createFlow': {
    signature:
      'createFlow<TData = Record<string, unknown>>(config: FlowConfig<TData>): FlowInstance<TData>',
    example: `// Generic over node data shape — typed consumers get strong narrowing
interface WorkflowData {
  kind: 'trigger' | 'filter' | 'transform' | 'notify'
  label: string
}

const flow = createFlow<WorkflowData>({
  nodes: [
    { id: '1', type: 'custom', position: { x: 0, y: 0 }, data: { kind: 'trigger', label: 'Start' } },
    { id: '2', type: 'custom', position: { x: 200, y: 100 }, data: { kind: 'notify', label: 'End' } },
  ],
  edges: [{ id: 'e1', source: '1', target: '2', animated: true }],
})

// node.data.kind narrows to the typed union, not unknown
const trigger = flow.findNodes((n) => n.data.kind === 'trigger')

flow.addNode({ id: '3', type: 'custom', position: { x: 100, y: 200 }, data: { kind: 'transform', label: 'New' } })
await flow.layout('layered', { direction: 'RIGHT' })  // auto-layout via lazy-loaded elkjs
const json = flow.toJSON(); flow.fromJSON(json)       // round-trip serialization

// Custom node renderer — every prop except id is a REACTIVE ACCESSOR
function CustomNode(props: NodeComponentProps<WorkflowData>) {
  return (
    <div
      class={() => (props.selected() ? 'selected' : '')}
      style={() => \`cursor: \${props.dragging() ? 'grabbing' : 'grab'}\`}
    >
      {() => props.data().label}
    </div>
  )
}

<Flow instance={flow} nodeTypes={{ custom: CustomNode }}>
  <Background variant="dots" />
  <Controls />
  <MiniMap />
</Flow>`,
    notes:
      "Signal-native nodes/edges. Generic over node data shape: createFlow<TData> returns FlowInstance<TData> so node.data.kind narrows correctly. Defaults to Record<string, unknown> if no generic supplied. NodeComponentProps has THREE reactive accessors — data: () => TData, selected: () => boolean, dragging: () => boolean — read inside reactive scopes so the node patches in place when ANY underlying state changes. Each node mounts EXACTLY ONCE across the lifetime of the graph regardless of how many drags, selection clicks, or updateNode mutations happen. Internally <Flow> uses <For> keyed by node.id plus per-node accessors that read live state from instance.nodes() — so a 60fps drag in a 1000-node graph is O(1) instead of O(N) per frame. Auto-layout via elkjs (lazy-loaded, ~1.4MB chunk only on first .layout() call). Pan/zoom via pointer events + CSS transforms. No D3. JSX components are NOT generic at the call site (<Flow<MyData> /> is invalid JSX) — FlowProps.instance is typed as FlowInstance<any> so typed consumers can pass FlowInstance<MyData> without casting.",
    mistakes: `- Forgetting to declare @pyreon/runtime-dom in consumer app deps — flow's JSX emits _tpl() which needs runtime-dom imports
- Reading props.data, props.selected, or props.dragging as plain values — they're ALL accessors, call them: props.data().kind, props.selected(), props.dragging()
- Calling props.data() OUTSIDE a reactive scope — captures the value once at component setup, defeating reactivity. Read it inside JSX expression thunks, effect, or computed: {() => props.data().label}
- Adding [key: string]: unknown index signature to your node data interface — no longer needed now that createFlow is generic. Just pass createFlow<MyData>(...)
- Using direction: 'row' on flow's containing layout — Pyreon Element accepts 'inline'|'rows'|'reverseInline'|'reverseRows', not 'row'
- Missing the <Flow nodeTypes={{ key: Component }}> registration — node.type strings dispatch to that map`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/code
  // ═══════════════════════════════════════════════════════════════════════════

  'code/createEditor': {
    signature:
      'createEditor(config: { value?: string, language?: EditorLanguage, theme?: EditorTheme, onChange?: (val: string) => void, minimap?: boolean, lineNumbers?: boolean, ... }): EditorInstance',
    example: `const editor = createEditor({
  value: '// hello',
  language: 'typescript',
  theme: 'dark',
  minimap: true,
  onChange: (next) => console.log('user edit:', next),
})

editor.value()              // reactive Signal<string>, read inside JSX/effects
editor.value.set('new')     // write back into CodeMirror
editor.cursor()             // computed { line, col }
editor.lineCount()          // computed
editor.goToLine(42)
editor.insert('new code')
editor.setDiagnostics([{ from: 0, to: 5, severity: 'error', message: '...' }])

<CodeEditor instance={editor} style="height: 400px" />
<DiffEditor original="old" modified="new" language="typescript" />`,
    notes:
      "Built on CodeMirror 6 (~250KB vs Monaco's ~2.5MB). 19 languages via lazy-loaded grammars (declared as optionalDependencies). Two-way binding: editor.value is a writable Signal — pass onChange for editor → external, set editor.value for external → editor. For external↔editor binding with built-in loop prevention, use the higher-level `bindEditorToSignal({ editor, signal, serialize, parse })` helper instead of hand-rolling the flag pattern. <CodeEditor> auto-mounts and cleans up on unmount.",
    mistakes: `- Forgetting to declare @pyreon/runtime-dom in consumer app deps — <CodeEditor> JSX emits _tpl() which needs runtime-dom imports
- Hand-rolling the applyingFromExternal/applyingFromEditor flag pattern for two-way binding — use the bindEditorToSignal helper instead, it handles the loop prevention correctly and is tested
- Calling editor methods before mount — they no-op safely but changes don't persist
- Setting both vim: true and emacs: true — emacs wins`,
  },

  'code/bindEditorToSignal': {
    signature:
      'bindEditorToSignal<T>(options: { editor: EditorInstance, signal: SignalLike<T>, serialize: (val: T) => string, parse: (text: string) => T | null, onParseError?: (err: Error) => void }): { dispose: () => void }',
    example: `import { bindEditorToSignal, createEditor } from '@pyreon/code'
import { signal } from '@pyreon/reactivity'

interface Doc { name: string; count: number }
const data = signal<Doc>({ name: 'Alice', count: 1 })

const editor = createEditor({
  value: JSON.stringify(data(), null, 2),
  language: 'json',
})

const binding = bindEditorToSignal({
  editor,
  signal: data,                              // accepts Signal<T> or any SignalLike<T>
  serialize: (val) => JSON.stringify(val, null, 2),
  parse: (text) => {
    try { return JSON.parse(text) } catch { return null }
  },
  onParseError: (err) => console.warn(err.message),
})

// Later, on unmount:
binding.dispose()`,
    notes:
      "Replaces the recurring loop-prevention flag-pair boilerplate (applyingFromExternal / applyingFromEditor) that consumers had to hand-roll for two-way external↔editor binding. The helper manages both directions, breaks the format-on-input race via internal flags, catches parse errors, and returns a disposable. Accepts any SignalLike<T> (Pyreon Signal, custom store wrapper, etc.). The editor itself ALSO has internal CM↔signal loop guards — this helper adds the SECOND layer for the external↔editor boundary.",
    mistakes: `- Forgetting to call binding.dispose() on unmount — leaks both effects until the editor instance is GC'd
- Non-deterministic serialize() — if serialize(parse(text)) returns a string structurally different from the input text, the helper dispatches redundant editor writes that fight the user's typing. JSON.stringify with consistent indentation is fine; pretty-printing that varies on every call is not
- Throwing in parse() without an onParseError handler — the helper catches and silently no-ops if no handler is provided. Pass onParseError to surface parse errors in your UI
- Returning a non-null value from parse() for malformed input — the helper writes whatever you return, including partial / corrupted state. Return null on parse failure, or throw with an error message
- Using bindEditorToSignal AND a manual editor.value.set() loop in the same component — defeats the loop prevention. Pick one binding strategy per editor instance`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/hotkeys
  // ═══════════════════════════════════════════════════════════════════════════

  'hotkeys/useHotkey': {
    signature:
      'useHotkey(shortcut: string, handler: (e: KeyboardEvent) => void, options?: HotkeyOptions): void',
    example: `useHotkey('mod+s', (e) => {
  e.preventDefault()
  save()
})

useHotkey('mod+k', () => openSearch(), { scope: 'global' })
useHotkeyScope('editor')  // activate scope for component lifetime`,
    notes:
      "Component-scoped, auto-unregisters on unmount. 'mod' = ⌘ on Mac, Ctrl elsewhere. Scope-based activation for context-aware shortcuts.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/table
  // ═══════════════════════════════════════════════════════════════════════════

  'table/useTable': {
    signature: 'useTable<T>(options: TableOptions<T>): Table<T>',
    example: `const table = useTable({
  data: () => users(),
  columns: [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'email', header: 'Email' },
  ],
})

// flexRender for column templates:
flexRender(cell.column.columnDef.cell, cell.getContext())`,
    notes: 'TanStack Table adapter with reactive options and auto state sync.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/virtual
  // ═══════════════════════════════════════════════════════════════════════════

  'virtual/useVirtualizer': {
    signature:
      'useVirtualizer(options: VirtualizerOptions): { virtualItems: Signal, totalSize: Signal, scrollToIndex: (i) => void, ... }',
    example: `const { virtualItems, totalSize } = useVirtualizer({
  count: 10000,
  getScrollElement: () => scrollRef.current,
  estimateSize: () => 35,
})`,
    notes: 'TanStack Virtual adapter. Also: useWindowVirtualizer for window-scoped virtualization.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/feature
  // ═══════════════════════════════════════════════════════════════════════════

  'feature/defineFeature': {
    signature:
      'defineFeature<T>(config: { name: string, schema: FeatureSchema<T>, api: FeatureApi<T> }): Feature<T>',
    example: `const Posts = defineFeature({
  name: 'posts',
  schema: { title: 'string', body: 'string', author: reference('users') },
  api: { baseUrl: '/api/posts' },
})

// Auto-generated hooks:
Posts.useList()    // paginated query
Posts.useById(id)  // single item query
Posts.useCreate()  // mutation
Posts.useForm(id)  // edit form with validation
Posts.useTable()   // TanStack Table config`,
    notes:
      'Schema-driven CRUD. Composes @pyreon/query, @pyreon/form, @pyreon/validation, @pyreon/store, @pyreon/table.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/storybook
  // ═══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/lint
  // ═══════════════════════════════════════════════════════════════════════════

  'lint/lint': {
    signature: 'lint(options?: LintOptions): LintResult',
    example: `import { lint } from "@pyreon/lint"

const result = lint({ paths: ["src/"], preset: "recommended" })
console.log(result.totalErrors, result.totalWarnings)

// With config file auto-loading + rule overrides
lint({ paths: ["."], ruleOverrides: { "pyreon/no-classname": "off" } })`,
    notes:
      'Programmatic API. 55 rules across 12 categories. Auto-loads .pyreonlintrc.json. Presets: recommended, strict, app, lib. Uses oxc-parser with AST caching.',
  },

  'lint/lintFile': {
    signature:
      'lintFile(filePath: string, sourceText: string, rules: Rule[], config: LintConfig, cache?: AstCache): LintFileResult',
    example: `import { lintFile, allRules, getPreset, AstCache } from "@pyreon/lint"

const cache = new AstCache()
const config = getPreset("recommended")
const result = lintFile("app.tsx", source, allRules, config, cache)`,
    notes: 'Low-level single-file API. Optional AstCache for repeat runs (FNV-1a hash keyed).',
  },

  'lint/cli': {
    signature:
      'pyreon-lint [--preset name] [--fix] [--format text|json|compact] [--quiet] [--watch] [--list] [--config path] [--ignore path] [--rule id=severity] [path...]',
    example: `pyreon-lint --preset strict --quiet    # CI mode
pyreon-lint --fix                       # auto-fix
pyreon-lint --watch src/                # watch mode
pyreon-lint --list                      # list all 55 rules
pyreon-lint --format json               # machine-readable`,
    notes:
      "CLI entry. Config: .pyreonlintrc.json, package.json 'pyreonlint' field. Ignore: .pyreonlintignore + .gitignore. Watch: fs.watch recursive with 100ms debounce.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/ui-core
  // ═══════════════════════════════════════════════════════════════════════════

  'ui-core/PyreonUI': {
    signature:
      "PyreonUI(props: { theme?: Theme; mode?: 'light' | 'dark' | 'system'; inversed?: boolean; children: VNodeChild }): VNodeChild",
    example: `import { PyreonUI } from "@pyreon/ui-core"
import { enrichTheme } from "@pyreon/unistyle"

const theme = enrichTheme({ colors: { primary: "#3b82f6" } })

<PyreonUI theme={theme} mode="system">
  <App />
</PyreonUI>

// mode="system" auto-detects OS dark mode via prefers-color-scheme
// inversed flips the resolved mode (light↔dark)`,
    notes:
      "Unified provider replacing 3 separate providers (theme, mode, config). Calls init() internally. mode='system' uses matchMedia('(prefers-color-scheme: dark)') and reactively updates.",
    mistakes: `- Using ThemeProvider + ModeProvider + ConfigProvider separately → Use PyreonUI instead
- Forgetting enrichTheme() → raw theme objects miss default breakpoints/spacing`,
  },

  'ui-core/useMode': {
    signature: "useMode(): Signal<'light' | 'dark'>",
    example: `import { useMode } from "@pyreon/ui-core"

const mode = useMode()
// mode() returns "light" or "dark" (resolved, reactive)
// Reflects OS preference when PyreonUI mode="system"`,
    notes:
      "Returns the resolved mode as a reactive signal. When mode='system', reflects the OS preference. When inversed is true, the mode is flipped.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/unistyle
  // ═══════════════════════════════════════════════════════════════════════════

  'unistyle/enrichTheme': {
    signature: 'enrichTheme(theme: PartialTheme): Theme',
    example: `import { enrichTheme } from "@pyreon/unistyle"

const theme = enrichTheme({
  colors: { primary: "#3b82f6", secondary: "#6366f1" },
  fonts: { body: "Inter, sans-serif" },
})

// Merges user overrides with default breakpoints, spacing, and units`,
    notes:
      'Merges a partial theme with the full default theme (breakpoints, spacing, unit utilities). Always use when passing a theme to PyreonUI.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/storybook
  // ═══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/rx
  // ═══════════════════════════════════════════════════════════════════════════

  'rx/filter': {
    signature:
      'filter<T>(source: Signal<T[]> | T[], predicate: (item: T) => boolean): Computed<T[]> | T[]',
    example: `import { filter } from '@pyreon/rx'

// Signal input → Computed output (auto-tracks):
const items = signal([1, 2, 3, 4, 5])
const evens = filter(items, n => n % 2 === 0)  // Computed<number[]>
evens()  // [2, 4]

// Plain input → plain output:
const result = filter([1, 2, 3, 4, 5], n => n > 3)  // [4, 5]`,
    notes:
      'Every @pyreon/rx function is overloaded: Signal<T[]> input produces Computed<T[]>, plain T[] input produces plain T[]. 24 functions total: filter, map, sortBy, groupBy, keyBy, uniqBy, take, skip, last, chunk, flatten, find, mapValues, count, sum, min, max, average, distinct, scan, combine, debounce, throttle, search.',
  },

  'rx/pipe': {
    signature: 'pipe<T>(source: Signal<T[]> | T[], ...operators: Operator[]): Computed<T[]> | T[]',
    example: `import { pipe, filter, sortBy, map } from '@pyreon/rx'

const users = signal([
  { name: 'Charlie', age: 35 },
  { name: 'Alice', age: 25 },
  { name: 'Bob', age: 30 },
])

// Compose transforms left-to-right:
const result = pipe(
  users,
  filter(u => u.age >= 30),
  sortBy('name'),
  map(u => u.name),
)
// Computed<string[]> → ["Bob", "Charlie"]`,
    notes:
      'Pipe composes operators left-to-right. Signal source produces reactive Computed that re-derives when source changes.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/toast
  // ═══════════════════════════════════════════════════════════════════════════

  'toast/toast': {
    signature:
      'toast(message: string, options?: ToastOptions): string\ntoast.success/error/warning/info/loading(message): string\ntoast.update(id, options): void\ntoast.dismiss(id?): void\ntoast.promise(promise, { loading, success, error }): string',
    example: `import { toast, Toaster } from '@pyreon/toast'

// Basic:
toast('Hello!')
toast.success('Saved!')
toast.error('Failed!')

// Loading → success pattern:
const id = toast.loading('Saving...')
await save()
toast.update(id, { type: 'success', message: 'Done!' })

// Promise helper:
toast.promise(fetchData(), {
  loading: 'Loading...',
  success: 'Loaded!',
  error: 'Failed to load',
})

// Dismiss:
toast.dismiss(id)  // one
toast.dismiss()    // all

// Mount Toaster once in your app:
<Toaster />`,
    notes:
      "Imperative API — call from anywhere, no context needed. <Toaster /> renders via Portal with CSS transitions, auto-dismiss, pause on hover. Accessible: role='alert', aria-live='polite'.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/url-state
  // ═══════════════════════════════════════════════════════════════════════════

  'url-state/useUrlState': {
    signature:
      'useUrlState<T>(key: string, defaultValue: T): UrlStateSignal<T>\nuseUrlState<T extends Record<string, unknown>>(schema: T): UrlStateSchema<T>',
    example: `import { useUrlState } from '@pyreon/url-state'

// Single param — synced to ?page=:
const page = useUrlState('page', 1)
page()       // 1 (auto-coerced number)
page.set(2)  // URL → ?page=2

// Schema mode — multiple params:
const filters = useUrlState({ page: 1, sort: 'name', desc: false })
filters.page()   // 1
filters.sort()   // "name"
filters.set({ page: 2, sort: 'date' })`,
    notes:
      'Auto type coercion (numbers, booleans, arrays). Uses replaceState (no history spam). Configurable debounce. SSR-safe — reads request URL on server.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/query — useSSE
  // ═══════════════════════════════════════════════════════════════════════════

  'query/useSSE': {
    signature:
      'useSSE<T>(options: { queryKey: unknown[], url: string, transform?: (event: MessageEvent) => T, ... }): { data: Signal<T>, error: Signal<Error>, status: Signal<string> }',
    example: `import { useSSE } from '@pyreon/query'

const { data, error, status } = useSSE({
  queryKey: ['events'],
  url: '/api/events',
  transform: (event) => JSON.parse(event.data),
})

// data() reactively updates on each SSE message
// Auto-reconnects on disconnect
// Integrates with QueryClient for cache invalidation`,
    notes:
      'Server-Sent Events hook. Same pattern as useSubscription but read-only (no send). Integrates with QueryClient cache.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/router — useIsActive
  // ═══════════════════════════════════════════════════════════════════════════

  'router/useIsActive': {
    signature: 'useIsActive(path: string, exact?: boolean): () => boolean',
    example: `import { useIsActive } from '@pyreon/router'

const isHome = useIsActive('/')
const isAdmin = useIsActive('/admin')          // prefix match
const isExactAdmin = useIsActive('/admin', true)  // exact only

// Reactive — updates when route changes:
<a class={{ active: isAdmin() }} href="/admin">Admin</a>`,
    notes:
      'Returns a reactive boolean. Segment-aware prefix matching: /admin matches /admin/users but not /admin-panel. Pass exact=true for exact-only matching.',
  },

  'router/useTypedSearchParams': {
    signature:
      "useTypedSearchParams<T>(schema: T): TypedSearchParams<T>",
    example: `import { useTypedSearchParams } from '@pyreon/router'

const params = useTypedSearchParams({ page: 'number', q: 'string', active: 'boolean' })
params.page()    // number (auto-coerced)
params.q()       // string
params.set({ page: 2 })  // updates URL`,
    notes:
      'Type-safe search params with auto-coercion from URL strings. Supports "string", "number", and "boolean" types.',
  },

  'router/useTransition': {
    signature: 'useTransition(): { isTransitioning: () => boolean }',
    example: `import { useTransition } from '@pyreon/router'

const { isTransitioning } = useTransition()
// true during navigation (guards + loaders), false when mounted`,
    notes:
      'Reactive signal for route transition state. Useful for progress bars and loading indicators.',
  },

  'router/useMiddlewareData': {
    signature: 'useMiddlewareData<T>(): T',
    example: `import { useMiddlewareData } from '@pyreon/router'

// After middleware sets ctx.data.user:
const data = useMiddlewareData<{ user: User }>()
// data.user is available in the component`,
    notes:
      'Reads data set by RouteMiddleware in the middleware chain. Middleware sets ctx.data properties, components read them.',
  },

  'storybook/renderToCanvas': {
    signature: 'renderToCanvas(context: StoryContext, canvasElement: HTMLElement): void',
    example: `// .storybook/main.ts:
export default { framework: '@pyreon/storybook' }

// Story file:
import type { Meta, StoryObj } from '@pyreon/storybook'
import { Button } from './Button'

const meta: Meta<typeof Button> = { component: Button }
export default meta

export const Primary: StoryObj<typeof meta> = {
  args: { variant: 'primary', label: 'Click me' },
}`,
    notes:
      'Storybook renderer for Pyreon components. Re-exports h, Fragment, signal, computed, effect, mount for story convenience.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/document-primitives
  // ═══════════════════════════════════════════════════════════════════════════

  'document-primitives/extractDocNode': {
    signature: 'extractDocNode(templateFn: () => VNode, options?: ExtractOptions): DocNode',
    example: `import {
  DocDocument, DocPage, DocHeading, DocText,
  extractDocNode,
} from '@pyreon/document-primitives'
import { download } from '@pyreon/document'

interface Resume { name: string; headline: string }

function ResumeTemplate(props: { resume: () => Resume }) {
  return (
    // title and author accept reactive accessors — extractDocNode
    // resolves them at extraction time, so each export click reads
    // the LIVE value from the underlying signal
    <DocDocument
      title={() => \`\${props.resume().name} — Resume\`}
      author={() => props.resume().name}
    >
      <DocPage>
        <DocHeading level="h1">{() => props.resume().name}</DocHeading>
        <DocText>{() => props.resume().headline}</DocText>
      </DocPage>
    </DocDocument>
  )
}

// One-step extraction. The two-step createDocumentExport(...).getDocNode()
// form is still exported for callers that want to pass the helper
// object around, but extractDocNode is the recommended form.
const tree = extractDocNode(() => <ResumeTemplate resume={store.resume} />)
await download(tree, 'resume.pdf')
await download(tree, 'resume.docx')
await download(tree, 'resume.html')
await download(tree, 'resume.md')`,
    notes:
      "18 primitives: DocDocument, DocPage, DocSection, DocRow, DocColumn, DocHeading, DocText, DocLink, DocImage, DocTable, DocList, DocListItem, DocCode, DocDivider, DocSpacer, DocButton, DocQuote, DocPageBreak. Same component tree renders in browser AND exports — primitives carry _documentType statics that extractDocumentTree (from @pyreon/connector-document) walks to produce a DocNode for @pyreon/document's render() to consume. DocDocument's title/author/subject accept either a string OR a `() => string` accessor; function values are stored in _documentProps and resolved at extraction time so reactive metadata works without `const initial = get()` workarounds. PR #197 also fixed a latent bug in extractDocumentTree: it now CALLS rocketstyle component functions to read post-attrs _documentProps, where before it only looked at the JSX vnode's props directly — every primitive's metadata was silently dropped during export until that fix landed.",
    mistakes: `- Calling props.title() at the top of a template body to "fix" reactivity — components run ONCE at mount, so this captures the initial value forever. Pass the accessor through to DocDocument as-is: <DocDocument title={() => get().name}>
- DocRow direction: layout props (direction, gap) go in .attrs() not .theme(). Element accepts 'inline' | 'rows' | 'reverseInline' | 'reverseRows' — 'row' is NOT valid
- For text children reactivity, pass a signal accessor and read inside body: <DocText>{() => store.field()}</DocText>
- Don't declare runtime-filled fields (tag, _documentProps) in the rocketstyle .attrs<P>() generic — they leak as required JSX props
- Using createDocumentExport(...).getDocNode() in new code — prefer extractDocNode(fn) which is one call instead of two. createDocumentExport is kept for backward compat`,
  },

  'document-primitives/createDocumentExport': {
    signature:
      'createDocumentExport(templateFn: () => VNode): { getDocNode(): DocNode }',
    example: `// Two-step form (kept for backward compat). New code should
// prefer the one-step extractDocNode helper.
import { createDocumentExport } from '@pyreon/document-primitives'

const helper = createDocumentExport(() => <Resume name="Aisha" />)
const tree = helper.getDocNode()`,
    notes:
      "Wrapper around extractDocNode. The wrapper-object form is kept for callers that want to pass the helper around (e.g. to wrapper components that take a DocumentExport instance). New code should use extractDocNode(templateFn) which is one call instead of two.",
  },
}
