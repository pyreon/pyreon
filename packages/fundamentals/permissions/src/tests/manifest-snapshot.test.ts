import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — permissions snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(`"- @pyreon/permissions — Reactive permissions — RBAC, ABAC, feature flags, subscription tiers. \`admin.*\` matches exactly one segment (\`admin.users\`, not \`admin.users.list\`); use \`admin.**\` to match any depth below \`admin\`, and \`*\` for everything. Resolution is most-specific-first, so an exact or \`**\` deny overrides a broader subtree grant."`)
  })

  it('renders to llms-full.txt section', () => {
    expect(renderLlmsFullSection(manifest)).toMatchInlineSnapshot(`
      "## @pyreon/permissions — Permissions

      Universal reactive permissions for Pyreon. A permission is a boolean or a predicate function — check with \`can(key, context?)\` which reads as a reactive signal in effects, computeds, and JSX. Supports wildcard matching (\`posts.*\` for one segment, \`posts.**\` for any depth below, \`*\` for everything — most-specific-first so a \`**\`/exact deny overrides a broader grant), inverse and multi-checks, throw-on-deny via \`can.assert()\`, and runtime updates via \`can.set()\` / \`can.patch()\` / \`can.clear()\`. Works for any authorization model: RBAC, ABAC, feature flags, subscription tiers. PermissionsProvider/usePermissions context pattern enables SSR and testing isolation.

      \`\`\`typescript
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
      \`\`\`

      > **Wildcard depth**: \`admin.*\` matches exactly one segment (\`admin.users\`, not \`admin.users.list\`); use \`admin.**\` to match any depth below \`admin\`, and \`*\` for everything. Resolution is most-specific-first, so an exact or \`**\` deny overrides a broader subtree grant.
      >
      > **Predicate reactivity**: If a predicate reads signals (e.g. \`userId()\`), the permission check re-evaluates when those signals change — but only when checked inside a reactive scope.
      >
      > **set vs patch**: \`can.set(map)\` replaces ALL permissions. \`can.patch(map)\` merges — existing keys not in the map are preserved.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    const keys = Object.keys(record)
    expect(keys).toContain('permissions/createPermissions')
    expect(keys).toContain('permissions/can.assert')
    expect(keys).toContain('permissions/PermissionsProvider')
    expect(keys).toContain('permissions/usePermissions')
    expect(keys.length).toBe(4)
    expect(record['permissions/createPermissions']!.notes).toContain('wildcard')
    expect(record['permissions/createPermissions']!.mistakes?.split('\n').length).toBe(3)
  })
})
