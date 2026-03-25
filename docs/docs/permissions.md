---
title: Permissions
description: Reactive type-safe permissions for Pyreon — universal, signal-driven, works with any authorization model
---

# @pyreon/permissions

Reactive permissions primitive for Pyreon. A permission is either a boolean or a function — check with `can()`, reactive in effects, computeds, and JSX. Works with any authorization model: RBAC, ABAC, feature flags, subscription tiers.

## Installation

::: code-group
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

Peer dependencies: `@pyreon/reactivity`, `@pyreon/core`

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
can('posts.read')              // true
can('posts.update', myPost)    // evaluates predicate
can('users.manage')            // false
```

## Core Concepts

### Permission Values

A permission value is either:
- **`true` / `false`** — static grant or denial
- **`(context?) => boolean`** — predicate, evaluated per-check with optional context

```tsx
const can = createPermissions({
  // Static
  'posts.read': true,
  'billing.export': false,

  // Predicate — instance-level check
  'posts.update': (post: Post) => post.authorId === userId(),

  // Predicate — derived from reactive state
  'users.manage': () => currentUser()?.role === 'admin',
})
```

### Checking Permissions

`can()` returns a boolean. It's reactive when called inside effects, computeds, or JSX `&#123;() => ...&#125;` wrappers.

```tsx
// Static check
can('posts.read')                // true

// Instance check — passes context to predicate
can('posts.update', somePost)    // evaluates (post) => post.authorId === userId()

// In JSX — reactive, updates when permissions change
{() => can('posts.read') && <PostList />}
{() => can('posts.update', post) && <EditButton />}

// In effects — reactive
effect(() => {
  if (can('users.manage')) showAdminTools()
})

// In computeds — reactive
const isAdmin = computed(() => can('users.manage'))
```

### Inverse and Multi-Checks

```tsx
// Inverse
can.not('billing.export')                        // true if denied

// All must be true
can.all('posts.read', 'posts.create')            // true if both granted

// At least one must be true
can.any('posts.update', 'posts.delete')           // true if either granted
```

## Updating Permissions

Permissions are reactive — all `can()` reads update automatically when the source changes.

### `can.set(map)` — Replace All

```tsx
// After login — set permissions from server response
can.set({
  'posts.read': true,
  'posts.create': true,
  'users.manage': true,
})

// Role change — replace everything
can.set(fromRole('viewer'))
```

### `can.patch(map)` — Merge

```tsx
// Subscription upgrade — add new permissions
can.patch({ 'billing.export': true })

// Feature flag toggle
can.patch({ 'feature.new-editor': false })
```

## Wildcard Matching

Wildcards allow grouping permissions under a prefix.

```tsx
const can = createPermissions({
  'posts.*': true,           // matches posts.read, posts.create, posts.delete, etc.
  'posts.delete': false,     // exact match overrides wildcard
})

can('posts.read')    // true  — matched by 'posts.*'
can('posts.create')  // true  — matched by 'posts.*'
can('posts.delete')  // false — exact match takes precedence
```

### Resolution Order

1. **Exact match** — `'posts.update'` → use it
2. **Prefix wildcard** — `'posts.*'` → use it
3. **Global wildcard** — `'*'` → use it (superadmin)
4. **No match** → `false` (denied)

```tsx
// Superadmin — global wildcard grants everything
const can = createPermissions({ '*': true })
can('literally.anything')  // true
```

## Introspection

For help dialogs, admin dashboards, or debugging.

```tsx
// All granted permission keys — reactive Computed<string[]>
can.granted()    // ['posts.read', 'posts.create', 'users.manage']

// All entries as [key, value] pairs — reactive Computed
can.entries()    // [['posts.read', true], ['users.manage', false], ...]
```

## Context Pattern (SSR / Testing)

For SSR isolation or testing, use the provider to scope a permissions instance.

```tsx
import { PermissionsProvider, usePermissions } from '@pyreon/permissions'

// Provide
<PermissionsProvider instance={can}>
  <App />
</PermissionsProvider>

// Consume
function AdminPanel() {
  const can = usePermissions()
  return () => can('admin') && <AdminDashboard />
}
```

## Real-World Patterns

### Role-Based Access Control (RBAC)

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

// After role change
can.set(fromRole('admin'))
```

### Server Response / JWT Claims

```tsx
// Server returns permission strings
const response = await fetch('/api/me')
const { permissions } = await response.json()
// permissions: ['posts:read', 'posts:create', 'users:manage']

// Transform to permission map
can.set(
  Object.fromEntries(
    permissions.map((p: string) => [p.replace(':', '.'), true])
  )
)
```

### Feature Flags

```tsx
const can = createPermissions({
  // Access control
  'posts.read': true,
  'posts.create': true,

  // Feature flags
  'feature.new-editor': true,
  'feature.dark-mode': false,

  // Subscription tier
  'tier.pro': true,
  'tier.enterprise': false,
})

{() => can('feature.new-editor') && <NewEditor />}
{() => can('tier.pro') && <ExportButton />}
```

### Instance-Level Ownership

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

### Multi-Tenant with Key Prefixes

```tsx
const can = createPermissions({
  'org:acme.admin': true,
  'ws:design.posts.*': true,
  'ws:engineering.posts.read': true,
})

can('ws:design.posts.delete')        // true — wildcard match
can('ws:engineering.posts.delete')   // false — only read granted
```

### Reactive Role Switching

```tsx
const can = createPermissions(fromRole('viewer'))

// Permissions automatically update in all components
effect(() => {
  can.set(fromRole(currentRole()))
})

// Every can() check in the app reacts to role changes
```

### With useQuery — Conditional Fetching

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
  Permissions,        // The callable permissions instance
  PermissionMap,      // Record<string, PermissionValue>
  PermissionValue,    // boolean | (context?) => boolean
  PermissionPredicate, // (context?) => boolean
} from '@pyreon/permissions'
```

## API Reference

| API | Description |
|---|---|
| `createPermissions(initial?)` | Create a reactive permissions instance |
| `can(key, context?)` | Check permission — reactive in effects/computeds/JSX |
| `can.not(key, context?)` | Inverse check |
| `can.all(...keys)` | True if all permissions granted |
| `can.any(...keys)` | True if any permission granted |
| `can.set(map)` | Replace all permissions |
| `can.patch(map)` | Merge into existing permissions |
| `can.granted()` | `Computed<string[]>` — all granted keys |
| `can.entries()` | `Computed<[string, PermissionValue][]>` — all entries |
| `PermissionsProvider` | Context provider for SSR/testing |
| `usePermissions()` | Access permissions from context |
