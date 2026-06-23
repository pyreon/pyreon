---
title: "Permissions — API Reference"
description: "Reactive permissions — RBAC, ABAC, feature flags, subscription tiers"
---

# @pyreon/permissions — API Reference

> **Generated** from `permissions`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [permissions](/docs/permissions).

Universal reactive permissions for Pyreon. A permission is a boolean or a predicate function — check with `can(key, context?)` which reads as a reactive signal in effects, computeds, and JSX. Supports wildcard matching (`posts.*` for one segment, `posts.**` for any depth below, `*` for everything — most-specific-first so a `**`/exact deny overrides a broader grant), inverse and multi-checks, throw-on-deny via `can.assert()`, and runtime updates via `can.set()` / `can.patch()` / `can.clear()`. Works for any authorization model: RBAC, ABAC, feature flags, subscription tiers. PermissionsProvider/usePermissions context pattern enables SSR and testing isolation.

## Features

- createPermissions(initial) — callable reactive permissions instance
- can(key, context?) — reactive signal check with predicate support
- Wildcards: `posts.*` (one segment), `posts.**` (any depth below), `*` (everything); most-specific-first so a `**`/exact deny overrides a broader grant
- can.not / can.all / can.any — inverse and multi-checks
- can.assert(key, context?) — throw-on-deny for loaders / guards / server actions
- can.set / can.patch / can.clear — replace, merge, or wipe permissions reactively
- PermissionsProvider / usePermissions — context pattern for SSR and testing

## Complete example

A full, end-to-end usage of the package:

```tsx
import { createPermissions, PermissionsProvider, usePermissions } from '@pyreon/permissions'

// Create a reactive permissions instance:
const can = createPermissions({
  'posts.read': true,
  'posts.update': (post: Post) => post.authorId === userId(),
  'posts.delete': false,
  'admin.*': false,  // wildcard — blocks admin.users, admin.settings, etc.
})

// Reactive checks in JSX — re-evaluate when permissions change:
const PostActions = (props: { post: Post }) => (
  <div>
    {() => can('posts.read') && <PostView post={props.post} />}
    {() => can('posts.update', props.post) && <EditButton />}
  </div>
)

// Multi-checks:
can.not('admin.dashboard')               // inverse
can.all('posts.read', 'posts.create')    // AND — all must pass
can.any('admin.users', 'posts.manage')   // OR — at least one

// Recursive subtree grant + specific deny (most-specific wins):
can.set({
  'billing.**': true,        // any depth: billing.read, billing.invoices.export, ...
  'billing.refunds.**': false, // deny the refunds subtree
})
can('billing.invoices.export') // true
can('billing.refunds.issue')   // false — denied subtree overrides the grant

// Imperative guard — throws if denied (route loaders / server actions):
can.assert('posts.delete', post)
await deletePost(post)

// Update after login — replaces all permissions reactively:
can.set(fromRole(user.role))
can.clear()                              // on logout — deny everything

// Partial update — merge new permissions with existing:
can.patch({ 'admin.*': true })

// Context pattern for SSR and testing:
const App = () => (
  <PermissionsProvider value={can}>
    <Router />
  </PermissionsProvider>
)

// Consume in child components:
const AdminPanel = () => {
  const can = usePermissions()
  return (() => can('admin.dashboard') ? <Dashboard /> : <AccessDenied />)
}
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`createPermissions`](#createpermissions) | function | Create a reactive permissions instance. |
| [`can.assert`](#can-assert) | function | Throw if a permission is NOT granted — the imperative companion to the reactive `can()` check, for route loaders, naviga |
| [`PermissionsProvider`](#permissionsprovider) | component | Context provider that makes a permissions instance available to descendant components via `usePermissions()`. |
| [`usePermissions`](#usepermissions) | hook | Consume the nearest `PermissionsProvider` value. |

## API

### createPermissions `function`

```ts
<T extends PermissionMap>(initial?: T) => Permissions
```

Create a reactive permissions instance. Returns a callable object — `can(key, context?)` checks a permission reactively (reads as a signal in effects and JSX). Permissions can be booleans or predicate functions `(context?) => boolean`. Supports wildcard keys: `admin.*` (exactly one segment), `admin.**` (any depth below `admin`), `*` (everything); resolution is most-specific-first, so an exact or `**` deny overrides a broader subtree grant. The instance exposes `.not()`, `.all()`, `.any()` for multi-checks, `.assert()` to throw-on-deny, and `.set()` / `.patch()` / `.clear()` for runtime updates.

**Example**

```tsx
const can = createPermissions({
  'posts.read': true,
  'posts.delete': (post) => post.authorId === userId,
  'admin.*': false,
})

can('posts.read')         // true (reactive)
can('posts.delete', post) // evaluates predicate
can.not('admin.dashboard')
can.all('posts.read', 'posts.create')
can.any('admin.users', 'posts.read')
can.set({ 'admin.*': true })  // replace all
can.patch({ 'posts.delete': true })  // merge
```

**Common mistakes**

- Reading `can("key")` outside a reactive scope and expecting updates — the check is a signal read, it only re-evaluates inside `effect()`, `computed()`, or JSX expression thunks
- Using a static object instead of a predicate for context-dependent checks — `'posts.update': true` always passes, use `(post) => post.authorId === userId()` for ABAC
- Forgetting that `admin.*` only matches ONE segment — `admin.users.list` is NOT matched by `admin.*` (only `admin.users` is). Use `admin.**` to match any depth below `admin`

**See also:** `PermissionsProvider` · `usePermissions` · `can.assert`

---

### can.assert `function`

```ts
can.assert(key: string, context?: unknown, message?: string) => void
```

Throw if a permission is NOT granted — the imperative companion to the reactive `can()` check, for route loaders, navigation guards, and server actions where a denial must halt execution. Throws a `[Pyreon]`-prefixed error — a custom `message`, or `permission denied: '<key>'` by default; returns void when granted. Evaluates predicates + wildcards exactly like `can()`.

**Example**

```tsx
// in a route loader / server action:
can.assert('posts.delete', post) // throws "[Pyreon] permission denied: 'posts.delete'"
can.assert('billing.export', undefined, 'Upgrade your plan to export') // custom message
await deletePost(post)
```

**Common mistakes**

- Using `can.assert` inside JSX for conditional rendering — it throws; use the boolean `can(key)` in render and reserve `assert` for imperative guard code

**See also:** `createPermissions`

---

### PermissionsProvider `component`

```ts
(props: { value: Permissions; children: VNodeChild }) => VNodeChild
```

Context provider that makes a permissions instance available to descendant components via `usePermissions()`. Enables SSR isolation (per-request permissions) and testing (override permissions per test).

**Example**

```tsx
<PermissionsProvider value={can}>
  <App />
</PermissionsProvider>
```

**See also:** `usePermissions` · `createPermissions`

---

### usePermissions `hook`

```ts
() => Permissions
```

Consume the nearest `PermissionsProvider` value. Returns the same callable `Permissions` instance. Throws if no provider is mounted.

**Example**

```tsx
const can = usePermissions()
return (() => can('admin.dashboard') ? <Dashboard /> : <AccessDenied />)
```

**See also:** `PermissionsProvider` · `createPermissions`

---

## Package-level notes

> **Wildcard depth:** `admin.*` matches exactly one segment (`admin.users`, not `admin.users.list`); use `admin.**` to match any depth below `admin`, and `*` for everything. Resolution is most-specific-first, so an exact or `**` deny overrides a broader subtree grant.

> **Predicate reactivity:** If a predicate reads signals (e.g. `userId()`), the permission check re-evaluates when those signals change — but only when checked inside a reactive scope.

> **set vs patch:** `can.set(map)` replaces ALL permissions. `can.patch(map)` merges — existing keys not in the map are preserved.
