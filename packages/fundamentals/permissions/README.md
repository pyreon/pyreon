# @pyreon/permissions

Reactive permissions for Pyreon. Type-safe, signal-driven, universal — works with RBAC, ABAC, feature flags, and subscription tiers. Any model maps to string keys with boolean or predicate values.

## Install

```bash
bun add @pyreon/permissions
```

## Quick Start

```tsx
import { createPermissions } from '@pyreon/permissions'

const can = createPermissions({
  'posts.read': true,
  'posts.create': true,
  'posts.update': (post: Post) => post.authorId === currentUserId(),
  'users.manage': false,
})

can('posts.read')              // true — reactive in effects/JSX
can('posts.update', myPost)    // evaluates predicate
can.not('billing.export')      // true if denied
can.all('posts.read', 'posts.create')  // true if both granted
can.any('posts.read', 'users.manage')  // true if any granted

// Update after login / role change
can.set(fromRole(user.role))
can.patch({ 'billing.export': true })

// Reactive in JSX
{() => can('posts.delete') && <DeleteButton />}
{() => can('users.manage') && <AdminPanel />}
```

## Wildcards

`'posts.*'` matches any `posts.X`. `'*'` matches everything (superadmin).

## Context Pattern

```tsx
import { PermissionsProvider, usePermissions } from '@pyreon/permissions'

<PermissionsProvider instance={can}>
  <App />
</PermissionsProvider>

// In any child component:
const can = usePermissions()
```

## API

### `createPermissions(initial?)`

Create a reactive permissions instance. Permission values are `boolean` (static) or `(context?) => boolean` (predicate).

| Method | Description |
| --- | --- |
| `can(key, context?)` | Check a permission (reactive) |
| `can.not(key)` | Inverse check |
| `can.all(...keys)` | True if all granted |
| `can.any(...keys)` | True if any granted |
| `can.set(map)` | Replace all permissions |
| `can.patch(map)` | Merge permissions |
| `can.granted()` | `Computed<string[]>` of all granted keys |
| `can.entries()` | `Computed<[key, value][]>` for introspection |

### `PermissionsProvider` / `usePermissions()`

Context pattern for dependency injection, SSR, and testing.

## License

MIT
