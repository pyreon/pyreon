import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — permissions snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(`"- @pyreon/permissions — Reactive permissions — RBAC, ABAC, feature flags, subscription tiers. \`admin.*\` matches \`admin.users\` but NOT \`admin.users.list\` — wildcards match exactly one segment."`)
  })

  it('renders to llms-full.txt section', () => {
    expect(renderLlmsFullSection(manifest)).toMatchInlineSnapshot(`
      "## @pyreon/permissions — Permissions

      Universal reactive permissions for Pyreon. A permission is a boolean or a predicate function — check with \`can(key, context?)\` which reads as a reactive signal in effects, computeds, and JSX. Supports wildcard matching (\`posts.*\` matches any \`posts.X\`), inverse and multi-checks, and runtime updates via \`can.set()\` / \`can.patch()\`. Works for any authorization model: RBAC, ABAC, feature flags, subscription tiers. PermissionsProvider/usePermissions context pattern enables SSR and testing isolation.

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
      }
      \`\`\`

      > **Wildcard depth**: \`admin.*\` matches \`admin.users\` but NOT \`admin.users.list\` — wildcards match exactly one segment.
      >
      > **Predicate reactivity**: If a predicate reads signals (e.g. \`userId()\`), the permission check re-evaluates when those signals change — but only when checked inside a reactive scope.
      >
      > **set vs patch**: \`can.set(map)\` replaces ALL permissions. \`can.patch(map)\` merges — existing keys not in the map are preserved.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).length).toBe(3)
    expect(record['permissions/createPermissions']!.notes).toContain('wildcard')
    expect(record['permissions/createPermissions']!.mistakes?.split('\n').length).toBe(3)
  })
})
