# @pyreon/permissions

Reactive permissions — RBAC, ABAC, feature flags, subscription tiers.

A unified callable `can(key, context?)` over a map of permission keys to either static booleans or predicate functions. Pyreon-signal-backed: reads inside effects / computeds / JSX track and re-evaluate when permissions change. Universal model — the same API covers role-based access control (boolean keys per role), attribute-based access control (predicate keys reading the resource), feature flags (boolean per flag name), and subscription tiers (predicate reading the user's plan). Wildcard matching (`'posts.*'` matches any `'posts.X'`) and an SSR-isolatable provider for per-request permission state.

## Install

```bash
bun add @pyreon/permissions @pyreon/core @pyreon/reactivity
```

## Quick start

```tsx
import { createPermissions, PermissionsProvider, usePermissions } from '@pyreon/permissions'

type Post = { id: string; authorId: string }

const can = createPermissions({
  'posts.read': true,
  'posts.create': true,
  'posts.update': (post: Post) => post.authorId === currentUser().id,
  'users.manage': false,
})

// Static check
can('posts.read') // true

// Instance check — predicate receives the context
can('posts.update', post) // post.authorId === currentUser().id

// Reactive in JSX
function PostActions(props: { post: Post }) {
  return () => (
    <>
      {can('posts.update', props.post) && <button>Edit</button>}
      {can('posts.delete', props.post) && <button>Delete</button>}
    </>
  )
}

// Provide via context (recommended for SSR / testing isolation)
;<PermissionsProvider instance={can}>
  <App />
</PermissionsProvider>
```

## API

`createPermissions(initial?: PermissionMap)` returns a callable `Permissions` instance:

| Method | Returns | Notes |
|---|---|---|
| `can(key, context?)` | `boolean` | Reactive — re-evaluates on permission change |
| `can.not(key, context?)` | `boolean` | Inverse — true when denied |
| `can.all(...keys)` | `boolean` | Every listed key granted |
| `can.any(...keys)` | `boolean` | At least one granted |
| `can.set(map)` | `void` | Replace all permissions reactively |
| `can.patch(map)` | `void` | Merge in — existing keys overwritten, new keys added |
| `can.granted` | `Computed<string[]>` | Currently granted keys (true + predicate-keys-that-exist) |
| `can.entries` | `Computed<[key, value][]>` | All entries — useful for admin dashboards |

### `PermissionsProvider` / `usePermissions()`

```tsx
<PermissionsProvider instance={can}>
  <App />
</PermissionsProvider>

function ProtectedRoute() {
  const can = usePermissions()
  return () => (can('users.manage') ? <UserAdmin /> : <Forbidden />)
}
```

`usePermissions()` throws if used outside a `<PermissionsProvider>`. The provider is marked `nativeCompat` so it works correctly under `@pyreon/{react,preact,vue,solid}-compat`.

## Permission values

```ts
type PermissionValue<TContext = unknown> =
  | boolean                                       // static grant or denial
  | ((context?: TContext) => boolean)             // dynamic — evaluated per check
```

- **`true` / `false`** — static (RBAC, feature flags).
- **Predicate `(ctx?) => boolean`** — runs every check (ABAC, subscription tiers). The predicate body can read other signals — those reads track too.

## Wildcard matching

```ts
const can = createPermissions({
  'posts.*': true, // grants posts.read, posts.create, posts.update, posts.delete, …
  'admin.*': () => currentUser().role === 'admin',
})

can('posts.read') // true (matches 'posts.*')
can('admin.users') // true if user is admin
```

A literal key always wins over a wildcard — `'posts.*': true` + `'posts.delete': false` means everything under `posts.*` is granted EXCEPT `posts.delete`.

## Common patterns

### Role-based access control

```ts
const fromRole = (role: 'admin' | 'editor' | 'viewer') => ({
  admin: { '*': true },
  editor: { 'posts.*': true, 'users.read': true },
  viewer: { 'posts.read': true },
})[role]

// On login:
can.set(fromRole(user.role))
```

### Attribute-based access control

```ts
can.patch({
  'posts.update': (post: Post) => post.authorId === user.id || user.role === 'admin',
  'posts.publish': (post: Post) => post.status === 'draft' && user.role !== 'viewer',
})
```

### Feature flags

```ts
can.patch({
  'experiments.newUI': featureFlag('new-ui'),
  'experiments.aiSuggest': featureFlag('ai-suggest'),
})

{() => can('experiments.newUI') && <NewExperience />}
```

### Subscription tiers

```ts
can.patch({
  'billing.export': () => subscription().tier === 'pro',
  'analytics.advanced': () => subscription().tier !== 'free',
})
```

## SSR / testing isolation

Per-request permissions via the provider:

```tsx
// Per request on the server:
const can = createPermissions(fromRole(req.user.role))

renderToString(
  <PermissionsProvider instance={can}>
    <App />
  </PermissionsProvider>,
)
```

Each request gets its own instance — no cross-request leakage. Same pattern for unit tests: construct a fresh `createPermissions(...)` per test.

## Gotchas

- **`can('posts.read')` reads a Pyreon signal** — reading inside imperative code outside a reactive scope returns a snapshot. Read inside `effect` / `computed` / JSX `{() => …}` for reactivity.
- **Predicates run on every check**, not memoized. If the predicate is expensive (DB lookup, complex traversal), wrap it in `computed` upstream and have the predicate read the computed result.
- **Wildcard precedence**: literal key beats wildcard. `'posts.*': true` + `'posts.delete': false` grants everything under `posts.*` except `posts.delete`.
- **`can.set(map)` replaces, `can.patch(map)` merges** — `set` removes any key absent from the new map; `patch` only adds / overrides.
- **`usePermissions()` throws** if no provider is mounted above the call site. For non-provider use (root-level setup, scripts), use the `createPermissions()` return value directly.
- **The provider is `nativeCompat`-marked** so `provide()` lands in Pyreon's setup frame even under `@pyreon/{react,preact,vue,solid}-compat`.

## Documentation

Full docs: [docs.pyreon.dev/docs/permissions](https://docs.pyreon.dev/docs/permissions) (or `docs/src/content/docs/permissions.md` in this repo).

## License

MIT
