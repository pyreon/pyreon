# @pyreon/permissions

Reactive permissions -- type-safe, signal-driven, universal. Works with RBAC, ABAC, feature flags, subscription tiers, or any model that maps to string keys.

## Installation

```bash
bun add @pyreon/permissions
```

## Usage

### Create Permissions

```tsx
import { createPermissions } from "@pyreon/permissions"

const can = createPermissions({
  "posts.read": true,
  "posts.create": true,
  "posts.update": (post: Post) => post.authorId === currentUserId(),
  "users.manage": false,
  "feature.new-editor": true,
})
```

### Check Permissions

```ts
can("posts.read")              // true (reactive in effects/computeds/JSX)
can("posts.update", myPost)    // evaluates predicate with context
can.not("billing.export")      // true if denied or undefined
can.all("posts.read", "posts.create")  // true if both granted
can.any("posts.read", "users.manage")  // true if at least one granted
```

### Reactive in JSX

```tsx
{() => can("posts.delete") && <DeleteButton />}
{() => can("users.manage") && <AdminPanel />}
{() => can.not("billing.export") && <UpgradePrompt />}
```

### Update Permissions

```ts
// Replace all permissions (e.g. after login)
can.set(fromRole(user.role))

// Merge new permissions
can.patch({ "billing.export": true, "feature.new-editor": false })
```

### Introspection

```ts
can.granted()   // Computed<string[]> of all granted permission keys
can.entries()   // Computed<[key, value][]> for all permissions
```

### Wildcards

```ts
const admin = createPermissions({ "*": true })      // superadmin
const editor = createPermissions({ "posts.*": true }) // all post permissions
```

`"posts.*"` matches any `posts.X` key. `"*"` matches everything.

### Context Pattern

```tsx
import { PermissionsProvider, usePermissions } from "@pyreon/permissions"

<PermissionsProvider instance={can}>
  <App />
</PermissionsProvider>

function AdminPanel() {
  const can = usePermissions()
  if (can.not("admin.access")) return null
  return <div>Admin content</div>
}
```

## API Reference

| Export | Description |
| --- | --- |
| `createPermissions(initial?)` | Create a reactive permissions instance |
| `can(key, context?)` | Check a permission (reactive) |
| `can.not(key)` | Inverse check |
| `can.all(...keys)` | All must be granted |
| `can.any(...keys)` | At least one must be granted |
| `can.set(map)` | Replace all permissions |
| `can.patch(map)` | Merge permissions |
| `can.granted()` | Computed list of granted keys |
| `can.entries()` | Computed list of all entries |
| `PermissionsProvider` | Context provider |
| `usePermissions()` | Context consumer |

Permission values: `boolean` (static) or `(context?) => boolean` (predicate function).
