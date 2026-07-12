---
title: Permissions
description: Reactive type-safe permissions for Pyreon — universal, signal-driven, works with any authorization model
---

`@pyreon/permissions` provides reactive, universal permissions. A permission is either a boolean or a predicate function — check it with `can(key, context?)`, which reads like a signal: it re-evaluates inside effects, computeds, and JSX. One primitive maps to any authorization model — RBAC, ABAC, feature flags, subscription tiers — because every model collapses to string keys.

<PackageBadge name="@pyreon/permissions" href="/docs/permissions" />

## Installation

:::code-group

```bash [npm]
npm install @pyreon/permissions
```

```bash [bun]
bun add @pyreon/permissions
```

```bash [pnpm]
pnpm add @pyreon/permissions
```

```bash [yarn]
yarn add @pyreon/permissions
```

:::

Peer dependencies: `@pyreon/reactivity`, `@pyreon/core`.

## Quick Start

```tsx
import { createPermissions } from '@pyreon/permissions'

const can = createPermissions({
  'posts.read': true,
  'posts.create': true,
  'posts.update': (post: Post) => post.authorId === currentUserId(),
  'users.manage': false,
})

// Check — reactive in effects/computeds/JSX
can('posts.read') // true
can('posts.update', myPost) // evaluates the predicate
can('users.manage') // false
```

<Example file="./examples/permissions/permissions-reactive-can" title="Permissions — reactive can()" />

## Why a Permissions Primitive?

Most apps scatter authorization across the codebase: inline `user.role === 'admin'` checks, ad-hoc helper functions, booleans threaded through props. That drifts — a check changes in one place but not another, and there is no single source of truth for "what can this user do?".

`@pyreon/permissions` centralizes the answer into one reactive object:

```tsx
// ❌ Scattered, non-reactive, drifts over time
if (user.role === 'admin' || user.role === 'editor') showEditButton()
if (post.authorId === user.id) showDeleteButton()

// ✅ One reactive source of truth — every check goes through `can`
const can = createPermissions({
  'posts.edit': () => ['admin', 'editor'].includes(role()),
  'posts.delete': (post: Post) => post.authorId === userId(),
})

{() => can('posts.edit') && <EditButton />}
{() => can('posts.delete', post) && <DeleteButton />}
```

Because the check is a signal read, the UI updates the moment permissions change — a role switch, a subscription upgrade, a logout — with no manual re-wiring.

## Core Concepts

### Permission Values

Every key maps to a `PermissionValue`, which is one of two things:

- **`true` / `false`** — a static grant or denial.
- **`(context?) => boolean`** — a predicate, evaluated on each check with optional context. This is how you express instance-level (ABAC) rules.

```tsx
const can = createPermissions({
  // Static grant / denial
  'posts.read': true,
  'billing.export': false,

  // Predicate — instance-level check, receives the context you pass to can()
  'posts.update': (post: Post) => post.authorId === userId(),

  // Predicate — derived from reactive state, ignores its context arg
  'users.manage': () => currentUser()?.role === 'admin',
})
```

A predicate that **throws** is treated as **denied** rather than crashing the check — so `can('posts.update')` (no context) against a predicate that reads `post.authorId` returns `false` instead of throwing. This mirrors the throw-safe guard behavior in [`@pyreon/machine`](/docs/machine).

```tsx
const can = createPermissions({
  'posts.update': (post: Post) => post.authorId === userId(),
})

can('posts.update') // false — predicate threw on `undefined.authorId`, caught → denied
can('posts.update', somePost) // evaluated normally
```

### Checking Permissions

`can(key, context?)` returns a `boolean`. It is **reactive** when read inside a reactive scope — an `effect()`, a `computed()`, or a JSX `{() => ...}` thunk. The check subscribes to an internal version signal, so every `can()` read re-runs automatically when permissions change via `set()` / `patch()` / `clear()`.

```tsx
// Static check
can('posts.read') // true

// Instance check — the second argument is passed to the predicate
can('posts.update', somePost) // evaluates (post) => post.authorId === userId()

// In JSX — reactive, re-renders when permissions change
{() => can('posts.read') && <PostList />}
{() => can('posts.update', post) && <EditButton />}

// In an effect — reactive
effect(() => {
  if (can('users.manage')) showAdminTools()
})

// In a computed — reactive
const isAdmin = computed(() => can('users.manage'))
```

:::warning[Read inside a reactive scope, or it won't update]
`can('key')` is a signal read. Calling it at module top level, or in a one-shot function that never re-runs, gives you the value **at that instant** — it will not update when permissions change. Read it inside `effect()`, `computed()`, or a JSX `{() => ...}` thunk to get live updates.

```tsx
// ❌ Captured once at setup — never updates when permissions change
const allowed = can('posts.read')
return <div>{allowed && <PostList />}</div>

// ✅ Read inside a JSX thunk — re-evaluates reactively
return <div>{() => can('posts.read') && <PostList />}</div>
```

:::

### Inverse and Multi-Checks

```tsx
// Inverse — true when the permission is DENIED
can.not('billing.export') // true if the user cannot export

// AND — true only if every key is granted
can.all('posts.read', 'posts.create') // true if both granted

// OR — true if at least one key is granted
can.any('posts.update', 'posts.delete') // true if either granted
```

:::note[`all` / `any` do not take a context argument]
`can.all(...keys)` and `can.any(...keys)` accept only permission keys — they evaluate each key with no context, so any predicate they touch receives `undefined`. For an instance-level check, use the single-key form `can(key, context)`. (Only `can(key, context?)`, `can.not(key, context?)`, and `can.assert(key, context?, message?)` accept a context argument.)
:::

## Reactive Gating in JSX

The idiomatic way to show or hide UI by permission is a `{() => ...}` thunk, or [`<Show>`](/docs/core) for an explicit fallback:

```tsx
import { Show } from '@pyreon/core'

function Toolbar() {
  return (
    <div>
      {/* Inline conditional — render nothing when denied */}
      {() => can('posts.create') && <NewPostButton />}

      {/* <Show> — render a fallback when denied */}
      <Show when={() => can('billing.export')} fallback={<UpgradePrompt />}>
        <ExportButton />
      </Show>
    </div>
  )
}
```

Both forms re-evaluate automatically when permissions change — switch roles and the toolbar updates without a manual refresh.

:::tip[Pass `when` as an accessor]
`<Show when={() => can('x')}>` — wrap the check in `() =>` so `<Show>` can re-run it reactively. A bare `<Show when={can('x')}>` captures the boolean once at mount and never updates.
:::

## Updating Permissions

Permissions are reactive end-to-end — every `can()` read updates automatically when the source map changes. Three methods mutate it.

### `can.set(map)` — Replace All

`set` discards the entire current map and installs a new one. Use it on login, logout, or any wholesale role change.

```tsx
// After login — install permissions from the server response
can.set({
  'posts.read': true,
  'posts.create': true,
  'users.manage': true,
})

// Role change — replace everything
can.set(fromRole('viewer'))
```

### `can.patch(map)` — Merge

`patch` merges the given keys into the existing map: keys present in the argument are overwritten or added, **keys not in the argument are preserved**.

```tsx
// Subscription upgrade — add a capability without dropping the rest
can.patch({ 'billing.export': true })

// Feature flag toggle — flip one key, keep everything else
can.patch({ 'feature.new-editor': false })
```

:::warning[`set` replaces, `patch` merges]
`can.set(map)` **replaces** the whole permission map — anything not in `map` is gone. `can.patch(map)` **merges** — existing keys not in `map` survive. Reaching for `set` when you meant `patch` silently wipes every permission you didn't re-list.
:::

### `can.clear()` — Deny Everything

`clear` empties the map. With no entries, every key falls through to "denied". Use it on logout.

```tsx
can.clear() // user logged out — every can() check is now false
```

It is equivalent to `can.set({})`.

## Wildcard Matching

Wildcards group permissions under a prefix so you don't have to enumerate every key. There are three forms, resolved **most-specific-first**.

### `prefix.*` — One Segment

`posts.*` matches keys that are exactly **one segment** below `posts` — `posts.read`, `posts.create`, `posts.delete` — but **not** `posts.read.title` (two segments deep).

```tsx
const can = createPermissions({
  'posts.*': true, // matches posts.read, posts.create, posts.delete, ...
  'posts.delete': false, // exact key wins over the wildcard
})

can('posts.read') // true  — matched by 'posts.*'
can('posts.create') // true  — matched by 'posts.*'
can('posts.delete') // false — exact match takes precedence
can('posts.read.title') // false — 'posts.*' is one segment only
```

### `prefix.**` — Any Depth Below

`posts.**` matches **any depth strictly below** `posts` — `posts.read`, `posts.admin.delete`, `posts.a.b.c`. It does **not** match the bare `posts` node itself (use `posts.*` or an exact `posts` key for that).

```tsx
const can = createPermissions({
  'billing.**': true, // any depth: billing.read, billing.invoices.export, ...
  'billing.refunds.**': false, // deny the refunds subtree specifically
})

can('billing.read') // true  — matched by 'billing.**'
can('billing.invoices.export') // true  — matched by 'billing.**'
can('billing.refunds.issue') // false — the more-specific 'billing.refunds.**' deny wins
```

This is the CASL `cannot`-over-`can` shape expressed in flat keys: a broad subtree grant plus a specific deny, with the deny winning because it is more specific.

### `*` — Everything

The global `*` matches any key at any depth. Use it for a superadmin.

```tsx
const can = createPermissions({ '*': true })
can('literally.anything') // true
can('billing.refunds.issue.now') // true
```

### Resolution Order

For a key like `posts.admin.delete`, `can()` walks this order and returns the **first** match:

1. **Exact match** — `posts.admin.delete`.
2. **Single-segment wildcard** — `posts.admin.*` (the immediate parent + `.*`).
3. **Recursive subtree wildcards** — `posts.admin.**`, then `posts.**`, walking ancestors most-specific-first.
4. **Global wildcard** — `*`.
5. **No match → `false`** (denied by default).

Because resolution is most-specific-first, an exact key or a deeper `**` always overrides a broader grant — so you can grant a whole subtree and carve out exceptions:

```tsx
const can = createPermissions({
  'admin.**': true, // grant the whole admin tree
  'admin.users.delete': false, // ...except this one capability
})

can('admin.settings.update') // true  — 'admin.**'
can('admin.users.list') // true  — 'admin.**'
can('admin.users.delete') // false — exact deny wins over 'admin.**'
```

:::warning[`*` matches one segment, `**` matches any depth]
`admin.*` matches `admin.users` but **not** `admin.users.list`. If you want a grant to cover an entire subtree at every depth, use `admin.**`. Mixing the two up is the most common wildcard mistake — a grant that "should" cover nested keys silently doesn't.
:::

## Imperative Guards with `can.assert`

`can()` is the reactive boolean for rendering. `can.assert()` is its imperative companion: it **throws** when a permission is denied, so a denial halts execution. Use it in route loaders, navigation guards, and server actions.

```tsx
// In a route loader / server action
can.assert('posts.delete', post) // throws "[Pyreon] permission denied: 'posts.delete'"
await deletePost(post)

// Custom message
can.assert('billing.export', undefined, 'Upgrade your plan to export')
// throws "[Pyreon] Upgrade your plan to export"
```

The thrown error is always `[Pyreon]`-prefixed — your custom `message` if you pass one, otherwise the default `permission denied: '<key>'`. It evaluates predicates and wildcards exactly like `can()`, and returns `void` when the permission is granted.

:::warning[Never use `assert` in render]
`can.assert` **throws** — it is for imperative guard code, not conditional rendering. Use the boolean `can(key)` (or `<Show>`) in JSX, and reserve `assert` for loaders, guards, and server actions where a throw should stop the request.

```tsx
// ❌ Throws and breaks the render the moment the user lacks the permission
{() => { can.assert('admin'); return <AdminPanel /> }}

// ✅ Boolean check in render, assert only in the guard
{() => can('admin') && <AdminPanel />}
```

:::

## Introspection

For help dialogs, admin dashboards, or debugging, the instance exposes two reactive computeds.

```tsx
// All granted keys — reactive Computed<string[]>.
// Includes keys whose value is `true` OR a predicate (the capability exists).
can.granted() // ['posts.read', 'posts.create', 'users.manage']

// All entries as [key, value] pairs — reactive Computed<[string, PermissionValue][]>
can.entries() // [['posts.read', true], ['posts.update', fn], ['billing.export', false], ...]
```

:::note[`granted()` lists predicate keys too]
`can.granted()` returns every key whose value is `true` **or** a predicate function — it does not evaluate predicates, so a key is "granted" if the capability *exists*, not if it currently passes for some context. Explicit `false` keys are excluded.
:::

## Context Pattern (SSR / Testing)

For SSR isolation (per-request permissions) or test isolation (override permissions per test), wrap your tree in `<PermissionsProvider>` and read the instance with `usePermissions()` instead of importing a module-level singleton.

```tsx
import { PermissionsProvider, usePermissions } from '@pyreon/permissions'

// Provide — the prop is `value`
function App({ can }: { can: Permissions }) {
  return (
    <PermissionsProvider value={can}>
      <Router />
    </PermissionsProvider>
  )
}

// Consume in any descendant
function AdminPanel() {
  const can = usePermissions()
  return () => (can('admin.dashboard') ? <Dashboard /> : <AccessDenied />)
}
```

`usePermissions()` throws `[Pyreon] usePermissions() must be used within <PermissionsProvider>.` if no provider is mounted above it — so a missing provider fails loudly rather than silently denying everything.

:::tip[SSR: build a fresh instance per request]
On the server, create a new `createPermissions(...)` instance per request from that request's session, and provide it via `<PermissionsProvider>`. A module-level singleton would leak one user's permissions across concurrent requests.

```tsx
// server handler — per-request instance, no cross-request leakage
function handler(req: Request) {
  const can = createPermissions(fromSession(req.session))
  return renderToString(
    <PermissionsProvider value={can}>
      <App />
    </PermissionsProvider>,
  )
}
```

:::

## Real-World Patterns

### Role-Based Access Control (RBAC)

Map each role to a permission map, then `set` it when the role changes.

```tsx
function fromRole(role: string): Record<string, boolean> {
  const roles: Record<string, Record<string, boolean>> = {
    admin: { '*': true },
    editor: {
      'posts.read': true,
      'posts.create': true,
      'posts.update': true,
      'users.read': true,
    },
    viewer: { 'posts.read': true, 'users.read': true },
  }
  return roles[role] ?? {}
}

const can = createPermissions(fromRole('editor'))

// On role change — replace the whole map
can.set(fromRole('admin'))
```

### Attribute-Based Access Control (ABAC)

ABAC rules depend on the *resource* being checked. Express them as predicates and pass the resource as the context argument.

```tsx
const can = createPermissions({
  'posts.read': true,
  'posts.update': (post: Post) => post.authorId === currentUserId(),
  'posts.delete': (post: Post) =>
    post.authorId === currentUserId() && post.status === 'draft',
})

function PostRow({ post }: { post: Post }) {
  return (
    <tr>
      <td>{post.title}</td>
      <td>
        {() => can('posts.update', post) && <EditButton post={post} />}
        {() => can('posts.delete', post) && <DeleteButton post={post} />}
      </td>
    </tr>
  )
}
```

Because the predicate reads `currentUserId()` (a signal), the check also re-evaluates when the current user changes — combining ABAC with reactivity.

### Feature Flags

Feature flags are just permission keys. Group them under a `feature.` prefix and gate UI on them like any other check.

```tsx
const can = createPermissions({
  // Access control
  'posts.read': true,
  'posts.create': true,

  // Feature flags
  'feature.new-editor': true,
  'feature.dark-mode': false,
})

{() => can('feature.new-editor') && <NewEditor />}

// Toggle a flag at runtime without touching the rest
can.patch({ 'feature.dark-mode': true })
```

### Subscription Tiers

Model tiers as keys and gate premium features on them. A subscription upgrade is a `patch`.

```tsx
const can = createPermissions({
  'tier.pro': true,
  'tier.enterprise': false,
})

{() => can('tier.pro') && <ExportButton />}
{() => can('tier.enterprise') && <SsoSettings />}

// User upgrades — flip the tier reactively
can.patch({ 'tier.enterprise': true })
```

### Server Response / JWT Claims

Servers often return permission strings. Transform them into a map and `set` it.

```tsx
const response = await fetch('/api/me')
const { permissions } = await response.json()
// permissions: ['posts:read', 'posts:create', 'users:manage']

can.set(
  Object.fromEntries(permissions.map((p: string) => [p.replace(':', '.'), true])),
)
```

### Reactive Role Switching

A predicate that reads a `role()` signal means the entire app re-evaluates the moment the role changes — no `set` call needed.

```tsx
const role = signal('viewer')

const can = createPermissions({
  'posts.read': true,
  'posts.edit': () => ['admin', 'editor'].includes(role()),
  'users.manage': () => role() === 'admin',
})

role.set('admin') // every can('posts.edit') / can('users.manage') re-evaluates
```

### Multi-Tenant with Key Prefixes

Namespace permissions per org or workspace by prefixing keys. Wildcards still apply within a prefix.

```tsx
const can = createPermissions({
  'org:acme.admin': true,
  'ws:design.posts.*': true,
  'ws:engineering.posts.read': true,
})

can('ws:design.posts.delete') // true  — matched by 'ws:design.posts.*'
can('ws:engineering.posts.delete') // false — only read was granted
```

### Route Guards with `assert`

In a router loader, `assert` halts navigation when the user lacks access.

```tsx
const route = {
  path: '/admin',
  loader: () => {
    can.assert('admin.dashboard', undefined, 'Admins only')
    return loadAdminData()
  },
}
```

### Conditional Data Fetching with `@pyreon/query`

Gate a query on a permission so it never runs for users who can't see the data.

```tsx
const { data } = useQuery(() => ({
  queryKey: ['users'],
  queryFn: fetchUsers,
  enabled: can('users.read'),
}))
```

## Type Exports

```tsx
import type {
  Permissions, // the callable permissions instance
  PermissionMap, // Record<string, PermissionValue>
  PermissionValue, // boolean | ((context?) => boolean)
  PermissionPredicate, // (context?) => boolean
} from '@pyreon/permissions'
```

| Type                 | Definition                            | Notes                                                     |
| -------------------- | ------------------------------------- | --------------------------------------------------------- |
| `Permissions`        | callable `(key, context?) => boolean` | the instance returned by `createPermissions`, with methods |
| `PermissionMap`      | `Record<string, PermissionValue>`     | the shape passed to `createPermissions` / `set` / `patch` |
| `PermissionValue`    | `boolean \| PermissionPredicate`      | a static grant/denial or a predicate                      |
| `PermissionPredicate`| `(context?: TContext) => boolean`     | evaluated per-check; throwing → denied                    |

## API Reference

### `createPermissions(initial?)`

| Parameter | Type            | Description                                                  |
| --------- | --------------- | ----------------------------------------------------------- |
| `initial` | `PermissionMap` | Optional initial permission map. Omitted → empty (deny all). |

Returns a callable `Permissions` instance.

### `Permissions` instance

| Member                          | Returns                                  | Description                                                                                                          |
| ------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `can(key, context?)`            | `boolean`                                | Check a permission. Reactive in effects/computeds/JSX. Passes `context` to a predicate; a throwing predicate → denied. |
| `can.not(key, context?)`        | `boolean`                                | Inverse — `true` when the permission is denied.                                                                    |
| `can.all(...keys)`              | `boolean`                                | `true` only if every key is granted. No context argument.                                                          |
| `can.any(...keys)`              | `boolean`                                | `true` if at least one key is granted. No context argument.                                                        |
| `can.set(map)`                  | `void`                                   | Replace the entire permission map. Reactive reads update.                                                          |
| `can.patch(map)`                | `void`                                   | Merge `map` into the current permissions; unlisted keys are preserved. Reactive reads update.                      |
| `can.clear()`                   | `void`                                   | Remove all permissions (deny everything). Equivalent to `can.set({})`.                                             |
| `can.assert(key, context?, message?)` | `void`                             | Throw a `[Pyreon]`-prefixed error if denied (custom `message`, or `permission denied: '<key>'`); else returns void. |
| `can.granted`                   | `Computed<string[]>`                     | Reactive list of all keys whose value is `true` or a predicate (the capability exists). Read as `can.granted()`.   |
| `can.entries`                   | `Computed<[string, PermissionValue][]>`  | Reactive list of all `[key, value]` pairs. Read as `can.entries()`.                                                |

### Wildcard keys

| Form        | Matches                                                              | Example                                                  |
| ----------- | ------------------------------------------------------------------- | -------------------------------------------------------- |
| `prefix.*`  | exactly **one** segment below `prefix`                              | `posts.*` → `posts.read` ✓, `posts.read.title` ✗         |
| `prefix.**` | **any depth** strictly below `prefix` (not the bare `prefix` node)  | `posts.**` → `posts.read` ✓, `posts.admin.delete` ✓      |
| `*`         | everything, any depth                                               | `*` → `literally.anything` ✓                             |

Resolution is **most-specific-first**: exact → `prefix.*` → `prefix.**` (nearest ancestor first) → `*` → `false`. A more-specific exact/`**` deny overrides a broader grant.

### Context (`@pyreon/core`)

| API                                    | Returns       | Description                                                                              |
| -------------------------------------- | ------------- | ---------------------------------------------------------------------------------------- |
| `<PermissionsProvider value={can}>`    | `VNodeChild`  | Provide a `Permissions` instance to descendants. The prop is **`value`**.                |
| `usePermissions()`                     | `Permissions` | Read the nearest provided instance. **Throws** if no `<PermissionsProvider>` is mounted. |
