import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/permissions',
  title: 'Permissions',
  tagline:
    'Reactive permissions — RBAC, ABAC, feature flags, subscription tiers',
  description:
    'Universal reactive permissions for Pyreon. A permission is a boolean or a predicate function — check with `can(key, context?)` which reads as a reactive signal in effects, computeds, and JSX. Supports wildcard matching (`posts.*` for one segment, `posts.**` for any depth below, `*` for everything — most-specific-first so a `**`/exact deny overrides a broader grant), inverse and multi-checks, throw-on-deny via `can.assert()`, and runtime updates via `can.set()` / `can.patch()` / `can.clear()`. Works for any authorization model: RBAC, ABAC, feature flags, subscription tiers. PermissionsProvider/usePermissions context pattern enables SSR and testing isolation.',
  category: 'universal',
  longExample: `import { createPermissions, PermissionsProvider, usePermissions } from '@pyreon/permissions'

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
}`,
  features: [
    'createPermissions(initial) — callable reactive permissions instance',
    'can(key, context?) — reactive signal check with predicate support',
    'Wildcards: `posts.*` (one segment), `posts.**` (any depth below), `*` (everything); most-specific-first so a `**`/exact deny overrides a broader grant',
    'can.not / can.all / can.any — inverse and multi-checks',
    'can.assert(key, context?) — throw-on-deny for loaders / guards / server actions',
    'can.set / can.patch / can.clear — replace, merge, or wipe permissions reactively',
    'PermissionsProvider / usePermissions — context pattern for SSR and testing',
  ],
  api: [
    {
      name: 'createPermissions',
      kind: 'function',
      signature: '<T extends PermissionMap>(initial?: T) => Permissions',
      summary:
        'Create a reactive permissions instance. Returns a callable object — `can(key, context?)` checks a permission reactively (reads as a signal in effects and JSX). Permissions can be booleans or predicate functions `(context?) => boolean`. Supports wildcard keys: `admin.*` (exactly one segment), `admin.**` (any depth below `admin`), `*` (everything); resolution is most-specific-first, so an exact or `**` deny overrides a broader subtree grant. The instance exposes `.not()`, `.all()`, `.any()` for multi-checks, `.assert()` to throw-on-deny, and `.set()` / `.patch()` / `.clear()` for runtime updates.',
      example: `const can = createPermissions({
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
can.patch({ 'posts.delete': true })  // merge`,
      mistakes: [
        'Reading `can("key")` outside a reactive scope and expecting updates — the check is a signal read, it only re-evaluates inside `effect()`, `computed()`, or JSX expression thunks',
        'Using a static object instead of a predicate for context-dependent checks — `\'posts.update\': true` always passes, use `(post) => post.authorId === userId()` for ABAC',
        'Forgetting that `admin.*` only matches ONE segment — `admin.users.list` is NOT matched by `admin.*` (only `admin.users` is). Use `admin.**` to match any depth below `admin`',
      ],
      seeAlso: ['PermissionsProvider', 'usePermissions', 'can.assert'],
    },
    {
      name: 'can.assert',
      kind: 'function',
      signature: 'can.assert(key: string, context?: unknown) => void',
      summary:
        'Throw if a permission is NOT granted — the imperative companion to the reactive `can()` check, for route loaders, navigation guards, and server actions where a denial must halt execution. Throws a `[Pyreon]`-prefixed error (`permission denied: \'<key>\'`); returns void when granted. Evaluates predicates + wildcards exactly like `can()`.',
      example: `// in a route loader / server action:
can.assert('posts.delete', post) // throws if denied
await deletePost(post)`,
      mistakes: [
        'Using `can.assert` inside JSX for conditional rendering — it throws; use the boolean `can(key)` in render and reserve `assert` for imperative guard code',
      ],
      seeAlso: ['createPermissions'],
    },
    {
      name: 'PermissionsProvider',
      kind: 'component',
      signature: '(props: { value: Permissions; children: VNodeChild }) => VNodeChild',
      summary:
        'Context provider that makes a permissions instance available to descendant components via `usePermissions()`. Enables SSR isolation (per-request permissions) and testing (override permissions per test).',
      example: `<PermissionsProvider value={can}>
  <App />
</PermissionsProvider>`,
      seeAlso: ['usePermissions', 'createPermissions'],
    },
    {
      name: 'usePermissions',
      kind: 'hook',
      signature: '() => Permissions',
      summary:
        'Consume the nearest `PermissionsProvider` value. Returns the same callable `Permissions` instance. Throws if no provider is mounted.',
      example: `const can = usePermissions()
return (() => can('admin.dashboard') ? <Dashboard /> : <AccessDenied />)`,
      seeAlso: ['PermissionsProvider', 'createPermissions'],
    },
  ],
  gotchas: [
    {
      label: 'Wildcard depth',
      note: '`admin.*` matches exactly one segment (`admin.users`, not `admin.users.list`); use `admin.**` to match any depth below `admin`, and `*` for everything. Resolution is most-specific-first, so an exact or `**` deny overrides a broader subtree grant.',
    },
    {
      label: 'Predicate reactivity',
      note: 'If a predicate reads signals (e.g. `userId()`), the permission check re-evaluates when those signals change — but only when checked inside a reactive scope.',
    },
    {
      label: 'set vs patch',
      note: '`can.set(map)` replaces ALL permissions. `can.patch(map)` merges — existing keys not in the map are preserved.',
    },
  ],
})
