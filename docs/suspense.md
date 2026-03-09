# Suspense, Lazy, and ErrorBoundary

Nova provides `lazy()` for code-split components, `Suspense` to show a fallback while lazy components load, and `ErrorBoundary` to catch and recover from rendering errors.

## lazy()

`lazy()` creates a component that loads its module on first render and suspends until the import resolves.

```ts
import { lazy } from "@pyreon/core"

const Settings = lazy(() => import("./Settings"))
const Dashboard = lazy(() => import("./Dashboard"))
```

The returned value is a component that can be used anywhere — in JSX, in a router, or in `h()` directly. It suspends the nearest `Suspense` boundary while the import is in flight.

## Suspense

`Suspense` renders a `fallback` while any lazy descendant is loading.

```tsx
import { Suspense, lazy } from "@pyreon/core"

const HeavyChart = lazy(() => import("./HeavyChart"))

function Dashboard() {
  return (
    <Suspense fallback={<p>Loading chart…</p>}>
      <HeavyChart data={chartData} />
    </Suspense>
  )
}
```

### Props

| Prop | Type | Description |
|---|---|---|
| `fallback` | `VNodeChild` | Shown while children are loading |
| `children` | `VNodeChild` | Normal content, may include lazy components |

### Multiple lazy components

A single `Suspense` boundary waits for all lazy children to resolve before showing content. If any one is still loading, the fallback is shown.

```tsx
<Suspense fallback={<Spinner />}>
  <LazyHeader />
  <LazyBody />
  <LazyFooter />
</Suspense>
```

## ErrorBoundary

`ErrorBoundary` catches errors thrown by descendants during rendering or in effects and renders a fallback UI instead of crashing the whole page.

```tsx
import { ErrorBoundary } from "@pyreon/core"

function App() {
  return (
    <ErrorBoundary
      fallback={err => (
        <div class="error-card">
          <h2>Something went wrong</h2>
          <pre>{String(err)}</pre>
        </div>
      )}
    >
      <MainContent />
    </ErrorBoundary>
  )
}
```

### Props

| Prop | Type | Description |
|---|---|---|
| `fallback` | `(err: unknown, reset: () => void) => VNodeChild` | Rendered when an error is caught. `reset` re-mounts children. |
| `children` | `VNodeChild` | The component subtree to protect |
| `onError` | `(err: unknown) => void` | Optional callback for logging |

### Error recovery with reset

The `fallback` function receives a `reset` callback. Calling it re-mounts the children subtree, giving the user a chance to retry.

```tsx
<ErrorBoundary
  fallback={(err, reset) => (
    <div>
      <p>Error: {String(err)}</p>
      <button onClick={reset}>Try again</button>
    </div>
  )}
  onError={err => reportToSentry(err)}
>
  <DataGrid />
</ErrorBoundary>
```

## Nesting Suspense and ErrorBoundary

Suspense and ErrorBoundary can be nested. The nearest ancestor boundary catches the event.

```tsx
function App() {
  return (
    // Outer error boundary — catches unrecoverable errors
    <ErrorBoundary fallback={err => <CrashPage error={err} />}>
      {/* Outer suspense — page-level skeleton */}
      <Suspense fallback={<PageSkeleton />}>
        <Layout>
          {/* Inner suspense — section-level spinner */}
          <Suspense fallback={<SectionSpinner />}>
            <ErrorBoundary fallback={(err, reset) => <SectionError onRetry={reset} />}>
              <LazyDashboard />
            </ErrorBoundary>
          </Suspense>
        </Layout>
      </Suspense>
    </ErrorBoundary>
  )
}
```

## Lazy Routes

The router integrates with `lazy()` transparently. Wrap lazy components in a `Suspense` at the router outlet level:

```tsx
import { lazy, Suspense } from "@pyreon/core"
import { createRouter, RouterView } from "@pyreon/router"

const router = createRouter({
  routes: [
    { path: "/", component: lazy(() => import("./Home")) },
    { path: "/settings", component: lazy(() => import("./Settings")) },
    { path: "/dashboard", component: lazy(() => import("./Dashboard")) },
  ],
})

function App() {
  return (
    <RouterProvider router={router}>
      <Suspense fallback={<PageSpinner />}>
        <RouterView />
      </Suspense>
    </RouterProvider>
  )
}
```

Each route's component loads only when first navigated to. Subsequent visits use the cached module.

## Loading State Pattern Without Suspense

For data fetching (not code splitting), use signals directly rather than Suspense:

```tsx
function UserCard({ id }: { id: number }) {
  const user = signal<User | null>(null)
  const loading = signal(true)
  const error = signal<Error | null>(null)

  onMount(() => {
    fetch(`/api/users/${id}`)
      .then(r => r.json())
      .then(data => { user.set(data); loading.set(false) })
      .catch(err => { error.set(err); loading.set(false) })
  })

  return (
    <>
      {() => loading() && <Spinner />}
      {() => error() && <ErrorMessage error={error()!} />}
      {() => user() && <Profile user={user()!} />}
    </>
  )
}
```

## Gotchas

**`lazy()` only works with default exports by default.** If your component is a named export, re-export it as default in the target module, or unwrap it in the import:

```ts
// Named export
const UserPage = lazy(() => import("./UserPage").then(m => ({ default: m.UserPage })))
```

**`Suspense` fallback is synchronous.** The fallback renders immediately when a lazy child suspends. It does not wait for a timeout or minimum display duration. If flashing is a concern, add a CSS animation delay to the fallback element.

**ErrorBoundary does not catch errors in event handlers.** Event handlers run outside Nova's rendering pipeline. Use `try/catch` directly in event handlers and surface errors via signals.

```tsx
function Form() {
  const submitError = signal<string | null>(null)

  const handleSubmit = async () => {
    try {
      await submitForm()
    } catch (err) {
      submitError.set(String(err))
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {() => submitError() && <p class="error">{submitError()}</p>}
      <button type="submit">Submit</button>
    </form>
  )
}
```

**`reset()` re-runs the component setup function.** All signals and lifecycle hooks inside the ErrorBoundary's children are re-initialized.
