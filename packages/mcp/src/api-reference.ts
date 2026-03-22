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

  "reactivity/signal": {
    signature: "signal<T>(initialValue: T, options?: { name?: string }): Signal<T>",
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
      "Signals are callable functions, NOT .value getters. Components run once — signal reads in JSX auto-subscribe.",
    mistakes: `- \`count.value\` → Use \`count()\` to read
- \`{count}\` in JSX → Use \`{count()}\` to read (or let the compiler wrap it)
- \`const [val, setVal] = signal(0)\` → Not destructurable. Use \`const val = signal(0)\``,
  },

  "reactivity/computed": {
    signature:
      "computed<T>(fn: () => T, options?: { equals?: (a: T, b: T) => boolean }): Computed<T>",
    example: `const count = signal(0)
const doubled = computed(() => count() * 2)

doubled()  // 0
count.set(5)
doubled()  // 10`,
    notes:
      "Dependencies auto-tracked. No dependency array needed. Memoized — only recomputes when dependencies change.",
    mistakes: `- \`computed(() => count)\` → Must call signal: \`computed(() => count())\`
- Don't use for side effects — use effect() instead`,
  },

  "reactivity/effect": {
    signature: "effect(fn: () => (() => void) | void): () => void",
    example: `const count = signal(0)

// Auto-tracks count() dependency:
const dispose = effect(() => {
  console.log("Count is:", count())
})

// With cleanup:
effect(() => {
  const handler = () => console.log(count())
  window.addEventListener("resize", handler)
  return () => window.removeEventListener("resize", handler)
})`,
    notes:
      "Returns a dispose function. Dependencies auto-tracked on each run. For DOM-specific effects, use renderEffect().",
    mistakes: `- Don't pass a dependency array — Pyreon auto-tracks
- \`effect(() => { count })\` → Must call: \`effect(() => { count() })\``,
  },

  "reactivity/batch": {
    signature: "batch(fn: () => void): void",
    example: `const a = signal(1)
const b = signal(2)

// Updates subscribers only once:
batch(() => {
  a.set(10)
  b.set(20)
})`,
    notes: "Defers all signal notifications until the batch completes. Nested batches are merged.",
  },

  "reactivity/createStore": {
    signature: "createStore<T extends object>(initialValue: T): T",
    example: `const store = createStore({
  user: { name: "Alice", age: 30 },
  items: [1, 2, 3]
})

// Granular reactivity — only rerenders what changed:
store.user.name = "Bob"  // only name subscribers fire
store.items.push(4)      // only items subscribers fire`,
    notes:
      "Deep proxy — nested objects are automatically reactive. Use reconcile() for bulk updates.",
  },

  "reactivity/createResource": {
    signature:
      "createResource<T>(fetcher: () => Promise<T>, options?: ResourceOptions): Resource<T>",
    example: `const users = createResource(() => fetch("/api/users").then(r => r.json()))

// In JSX:
<Show when={!users.loading()}>
  <For each={users()} by={u => u.id}>
    {user => <li>{user.name}</li>}
  </For>
</Show>`,
    notes:
      "Integrates with Suspense. Access .loading(), .error(), and call resource() for the value.",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/core
  // ═══════════════════════════════════════════════════════════════════════════

  "core/h": {
    signature:
      "h<P>(type: ComponentFn<P> | string | symbol, props: P | null, ...children: VNodeChild[]): VNode",
    example: `// Usually use JSX instead:
const vnode = h("div", { class: "container" },
  h("h1", null, "Hello"),
  h(Counter, { initial: 0 })
)`,
    notes: "Low-level API. Prefer JSX which compiles to h() calls (or _tpl() for templates).",
  },

  "core/Fragment": {
    signature: "Fragment: symbol",
    example: `// JSX:
<>
  <h1>Title</h1>
  <p>Content</p>
</>

// h() API:
h(Fragment, null, h("h1", null, "Title"), h("p", null, "Content"))`,
  },

  "core/onMount": {
    signature: "onMount(fn: () => CleanupFn | void): void",
    example: `const Timer = () => {
  const count = signal(0)

  onMount(() => {
    const id = setInterval(() => count.update(n => n + 1), 1000)
    return () => clearInterval(id)  // cleanup
  })

  return <div>{count()}</div>
}`,
    notes: "Optionally return a cleanup function that runs on unmount.",
    mistakes: `- Forgetting cleanup: \`onMount(() => { const id = setInterval(...) })\` → Return cleanup: \`onMount(() => { const id = setInterval(...); return () => clearInterval(id) })\``,
  },

  "core/onUnmount": {
    signature: "onUnmount(fn: () => void): void",
    example: `onUnmount(() => {
  console.log("Component removed from DOM")
})`,
  },

  "core/createContext": {
    signature: "createContext<T>(defaultValue: T): Context<T>",
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

  "core/useContext": {
    signature: "useContext<T>(ctx: Context<T>): T",
    example: `const theme = useContext(ThemeContext)  // returns provided value or default`,
  },

  "core/For": {
    signature: "<For each={items} by={keyFn}>{renderFn}</For>",
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

  "core/Show": {
    signature: "<Show when={condition} fallback={alternative}>{children}</Show>",
    example: `<Show when={isLoggedIn()} fallback={<LoginForm />}>
  <Dashboard />
</Show>`,
    notes:
      "More efficient than ternary for signal-driven conditions. Only mounts/unmounts when condition changes.",
  },

  "core/Suspense": {
    signature: "<Suspense fallback={loadingUI}>{children}</Suspense>",
    example: `const LazyPage = lazy(() => import("./HeavyPage"))

<Suspense fallback={<div>Loading...</div>}>
  <LazyPage />
</Suspense>`,
  },

  "core/lazy": {
    signature:
      "lazy(loader: () => Promise<{ default: ComponentFn }>, options?: LazyOptions): LazyComponent",
    example: `const Settings = lazy(() => import("./pages/Settings"))

// Use in JSX (wrap with Suspense):
<Suspense fallback={<Spinner />}>
  <Settings />
</Suspense>`,
  },

  "core/Dynamic": {
    signature: "<Dynamic component={comp} {...props} />",
    example: `const components = { home: HomePage, about: AboutPage }
const current = signal("home")

<Dynamic component={components[current()]} />`,
  },

  "core/ErrorBoundary": {
    signature: "<ErrorBoundary onCatch={handler} fallback={errorUI}>{children}</ErrorBoundary>",
    example: `<ErrorBoundary
  onCatch={(err) => console.error(err)}
  fallback={(err) => <div>Error: {err.message}</div>}
>
  <App />
</ErrorBoundary>`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/router
  // ═══════════════════════════════════════════════════════════════════════════

  "router/createRouter": {
    signature: "createRouter(options: RouterOptions | RouteRecord[]): Router",
    example: `const router = createRouter([
  { path: "/", component: Home },
  { path: "/user/:id", component: User, loader: ({ params }) => fetchUser(params.id) },
  { path: "/admin", component: Admin, beforeEnter: requireAuth, children: [
    { path: "settings", component: Settings },
  ]},
])`,
  },

  "router/RouterProvider": {
    signature: "<RouterProvider router={router}>{children}</RouterProvider>",
    example: `const App = () => (
  <RouterProvider router={router}>
    <nav><RouterLink to="/">Home</RouterLink></nav>
    <RouterView />
  </RouterProvider>
)`,
  },

  "router/RouterView": {
    signature: "<RouterView />",
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

  "router/RouterLink": {
    signature: "<RouterLink to={path} activeClass={cls} exactActiveClass={cls} />",
    example: `<RouterLink to="/" activeClass="nav-active">Home</RouterLink>
<RouterLink to={{ name: "user", params: { id: "42" } }}>Profile</RouterLink>`,
  },

  "router/useRouter": {
    signature: "useRouter(): Router",
    example: `const router = useRouter()

router.push("/settings")
router.push({ name: "user", params: { id: "42" } })
router.replace("/login")
router.back()
router.forward()
router.go(-2)`,
  },

  "router/useRoute": {
    signature: "useRoute<TPath extends string>(): () => ResolvedRoute<ExtractParams<TPath>>",
    example: `// Type-safe params:
const route = useRoute<"/user/:id">()
const userId = route().params.id  // string

// Access query, meta, etc:
route().query
route().meta`,
  },

  "router/useSearchParams": {
    signature:
      "useSearchParams<T>(defaults?: T): [get: () => T, set: (updates: Partial<T>) => Promise<void>]",
    example: `const [search, setSearch] = useSearchParams({ page: "1", sort: "name" })

// Read:
search().page  // "1"

// Write:
setSearch({ page: "2" })`,
  },

  "router/useLoaderData": {
    signature: "useLoaderData<T>(): T",
    example: `// Route: { path: "/user/:id", component: User, loader: ({ params }) => fetchUser(params.id) }

const User = () => {
  const data = useLoaderData<UserData>()
  return <div>{data.name}</div>
}`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/head
  // ═══════════════════════════════════════════════════════════════════════════

  "head/useHead": {
    signature: "useHead(input: UseHeadInput | (() => UseHeadInput)): void",
    example: `// Static:
useHead({ title: "My Page", meta: [{ name: "description", content: "..." }] })

// Reactive (updates when signals change):
useHead(() => ({
  title: \`\${username()} — Profile\`,
  meta: [{ property: "og:title", content: username() }]
}))`,
  },

  "head/HeadProvider": {
    signature: "<HeadProvider>{children}</HeadProvider>",
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

  "server/createHandler": {
    signature: "createHandler(options: HandlerOptions): (req: Request) => Promise<Response>",
    example: `import { createHandler } from "@pyreon/server"

export default createHandler({
  App,
  routes,
  clientEntry: "/src/entry-client.ts",
  mode: "stream",  // or "string"
})`,
  },

  "server/island": {
    signature:
      "island(loader: () => Promise<ComponentFn>, options: { name: string; hydrate?: HydrationStrategy }): ComponentFn",
    example: `const SearchBar = island(
  () => import("./SearchBar"),
  { name: "SearchBar", hydrate: "visible" }
)

// Hydration strategies: "load" | "idle" | "visible" | "media" | "never"`,
  },

  "server/prerender": {
    signature: "prerender(options: PrerenderOptions): Promise<PrerenderResult>",
    example: `await prerender({
  handler,
  paths: ["/", "/about", "/blog/1", "/blog/2"],
  outDir: "./dist",
})`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // @pyreon/runtime-dom
  // ═══════════════════════════════════════════════════════════════════════════

  "runtime-dom/mount": {
    signature: "mount(root: VNodeChild, container: Element): () => void",
    example: `import { mount } from "@pyreon/runtime-dom"

const dispose = mount(<App />, document.getElementById("app")!)

// To unmount:
dispose()`,
    mistakes: `- \`createRoot(container).render(<App />)\` → Use \`mount(<App />, container)\`
- Container must not be null/undefined`,
  },

  "runtime-dom/hydrateRoot": {
    signature: "hydrateRoot(root: VNodeChild, container: Element): () => void",
    example: `import { hydrateRoot } from "@pyreon/runtime-dom"

// Hydrate server-rendered HTML:
hydrateRoot(<App />, document.getElementById("app")!)`,
  },

  "runtime-dom/Transition": {
    signature: "<Transition name={name} mode={mode}>{children}</Transition>",
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
}
