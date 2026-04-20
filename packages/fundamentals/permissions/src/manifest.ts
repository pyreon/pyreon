import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/permissions',
  title: 'Permissions',
  tagline:
    'Reactive permissions — RBAC, ABAC, feature flags, subscription tiers',
  description:
    'Universal reactive permissions for Pyreon. A permission is a boolean or a predicate function — check with `can(key, context?)` which reads as a reactive signal in effects, computeds, and JSX. Supports wildcard matching (`posts.*` matches any `posts.X`), inverse and multi-checks, and runtime updates via `can.set()` / `can.patch()`. Works for any authorization model: RBAC, ABAC, feature flags, subscription tiers. PermissionsProvider/usePermissions context pattern enables SSR and testing isolation.',
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

// Update after login — replaces all permissions reactively:
can.set(fromRole(user.role))

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
    'Wildcard matching: `posts.*` matches any `posts.X`',
    'can.not / can.all / can.any — inverse and multi-checks',
    'can.set / can.patch — replace or merge permissions reactively',
    'PermissionsProvider / usePermissions — context pattern for SSR and testing',
  ],
  api: [
    {
      name: 'createPermissions',
      kind: 'function',
      signature: '<T extends PermissionMap>(initial?: T) => Permissions',
      summary:
        'Create a reactive permissions instance. Returns a callable object — `can(key, context?)` checks a permission reactively (reads as a signal in effects and JSX). Permissions can be booleans or predicate functions `(context?) => boolean`. Supports wildcard keys (`admin.*`). The instance exposes `.not()`, `.all()`, `.any()` for multi-checks, and `.set()` / `.patch()` for runtime updates.',
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
        'Forgetting that wildcard `admin.*` only matches one level — `admin.users.list` is NOT matched by `admin.*`, only `admin.users` is',
      ],
      seeAlso: ['PermissionsProvider', 'usePermissions'],
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
      note: '`admin.*` matches `admin.users` but NOT `admin.users.list` — wildcards match exactly one segment.',
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
