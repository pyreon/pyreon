# Routing

Pyreon Zero uses file-based routing. Files in `src/routes/` automatically become routes.

## Conventions

| File path                     | URL pattern       | Notes                     |
| ----------------------------- | ----------------- | ------------------------- |
| `index.tsx`                   | `/`               | Index route               |
| `about.tsx`                   | `/about`          | Static route              |
| `users/index.tsx`             | `/users`          | Nested index              |
| `users/[id].tsx`              | `/users/:id`      | Dynamic parameter         |
| `users/[id]/settings.tsx`     | `/users/:id/settings` | Nested dynamic        |
| `blog/[...slug].tsx`          | `/blog/:slug*`    | Catch-all                 |
| `(auth)/login.tsx`            | `/login`          | Route group (URL-invisible) |
| `_layout.tsx`                 | —                 | Layout wrapper            |
| `_error.tsx`                  | —                 | Error boundary            |
| `_loading.tsx`                | —                 | Loading fallback          |

## Dynamic parameters

Wrap a segment in brackets to create a dynamic route:

```
src/routes/users/[id].tsx → /users/:id
```

Access params via the route loader or `useRoute()`:

```tsx
import { useRoute } from "@pyreon/router"

export default function User() {
  const route = useRoute()
  return <h1>User {route().params.id}</h1>
}
```

## Catch-all routes

Use `[...param]` for catch-all segments:

```
src/routes/docs/[...path].tsx → /docs/:path*
```

This matches `/docs/getting-started`, `/docs/api/query`, etc.

## Layouts

A `_layout.tsx` file wraps all routes at its level and below:

```
src/routes/
  _layout.tsx          ← wraps everything
  index.tsx
  dashboard/
    _layout.tsx        ← wraps dashboard/*
    index.tsx
    settings.tsx
```

Layout components receive children:

```tsx
export function layout(props) {
  return (
    <>
      <nav><a href="/">Home</a></nav>
      {props.children}
    </>
  )
}
```

## Route groups

Directories wrapped in parentheses `(name)` are stripped from the URL:

```
src/routes/
  (marketing)/
    pricing.tsx        → /pricing
    features.tsx       → /features
  (dashboard)/
    _layout.tsx        ← shared dashboard layout
    overview.tsx       → /overview
    settings.tsx       → /settings
```

Groups let you share layouts and organize code without affecting URLs.

## Route module exports

Each route file can export:

| Export         | Type               | Description                              |
| -------------- | ------------------ | ---------------------------------------- |
| `default`      | `ComponentFn`      | Page component (required)                |
| `layout`       | `ComponentFn`      | Layout wrapper                           |
| `loading`      | `ComponentFn`      | Shown during lazy load / Suspense        |
| `error`        | `ComponentFn`      | Error boundary component                 |
| `loader`       | `(ctx) => Promise`  | Server-side data loader                  |
| `middleware`   | `Middleware \| Middleware[]` | Per-route middleware            |
| `guard`        | `NavigationGuard`  | Can redirect or block navigation         |
| `meta`         | `RouteMeta`        | Route metadata (title, description, ...) |
| `renderMode`   | `RenderMode`       | Override rendering mode for this route   |

## Data loading

Export a `loader` function for server-side data fetching. Access the data in your component with `useLoaderData()` from `@pyreon/router`:

```tsx
import { useLoaderData } from "@pyreon/router"
import type { LoaderContext } from "@pyreon/zero"

interface User {
  id: string
  name: string
}

export async function loader(ctx: LoaderContext) {
  const res = await fetch(`https://api.example.com/users/${ctx.params.id}`)
  return res.json()
}

export default function UserPage() {
  const user = useLoaderData<User>()
  return <h1>{user.name}</h1>
}
```

The `LoaderContext` provides:

| Property   | Type                       | Description               |
| ---------- | -------------------------- | ------------------------- |
| `params`   | `Record<string, string>`   | URL parameters            |
| `query`    | `Record<string, string>`   | Query string parameters   |
| `signal`   | `AbortSignal`              | Cancellation signal       |
| `request`  | `Request`                  | Incoming request          |

Loaders run on the server before rendering. Data is serialized and hydrated on the client automatically.

## Error boundaries

A `_error.tsx` file provides an error boundary for all routes at its level and below:

```tsx
// src/routes/_error.tsx
export default function ErrorBoundary() {
  return (
    <div>
      <h1>Something went wrong</h1>
      <p>Please try again later.</p>
    </div>
  )
}
```

You can also export an `error` component from any route file to override the directory-level error boundary for that specific route.

## Loading fallbacks

A `_loading.tsx` file provides a loading fallback while route components are being lazy-loaded:

```tsx
// src/routes/_loading.tsx
export default function Loading() {
  return <div>Loading...</div>
}
```

## Navigation guards

Export a `guard` function to protect routes:

```tsx
import type { NavigationGuard } from "@pyreon/router"

export const guard: NavigationGuard = (to, from) => {
  const isAuthenticated = checkAuth()
  if (!isAuthenticated) return "/login"  // redirect
  return true  // allow
}

export default function Dashboard() { /* ... */ }
```

Guard return values:
- `true` / `undefined` — allow navigation
- `false` — block navigation
- `string` — redirect to that path

## Sort order

Routes are matched in this priority:
1. Static routes before dynamic
2. Dynamic routes before catch-all
3. Layouts first within the same depth
4. Alphabetical within the same type
