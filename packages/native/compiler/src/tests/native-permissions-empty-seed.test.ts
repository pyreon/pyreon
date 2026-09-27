// `@pyreon/permissions` was 1:1-inverted at the CALL SITE, the same shape
// `@pyreon/state-tree`'s `model()` had.
//
// Web `usePermissions()` takes NO arguments — it is a context consumer that
// throws without a `<PermissionsProvider>`. That provider has no native
// lowering, so the correct web call emitted `PyreonPermissions()` with an
// EMPTY grant set: every check denied on device, silently, and every
// permission-guarded view simply never appeared.
//
// The only way to get a non-empty native set is `usePermissions([...])` — a
// call the web API rejects (`Expected 0 arguments, but got 1`). So the source
// that worked natively did not typecheck on web, and the source that worked
// on web denied everything natively.
//
// Seeding the provider natively is a larger arc (the container has to reach
// the subtree the way the router does). What this closes is the SILENCE: the
// deny-everything case now says so, and the provider's own advice no longer
// tells an author already using the hook to "use the hook instead".

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const bare = `import { usePermissions } from '@pyreon/permissions'
import { Text } from '@pyreon/primitives'
export function App() {
  const can = usePermissions()
  return <Text>{can('posts.edit') ? 'y' : 'n'}</Text>
}`

const seeded = `import { usePermissions } from '@pyreon/permissions'
import { Text } from '@pyreon/primitives'
export function App() {
  const can = usePermissions(['posts.*'])
  return <Text>{can('posts.edit') ? 'y' : 'n'}</Text>
}`

describe('an empty native permission set announces itself', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: a bare usePermissions() warns that every check will deny`, () => {
      const w = transform(bare, { target }).warnings.join('\n')
      expect(w).toContain('usePermissions()')
      expect(w).toContain('EMPTY')
      // The actionable half — an author needs the shape that does work.
      expect(w).toContain('usePermissions(["posts.*"')
    })

    it(`${target}: a seeded usePermissions([...]) is silent`, () => {
      // Additive in both directions: the shape that produces a real grant
      // set must not acquire a warning.
      const w = transform(seeded, { target }).warnings.join('\n')
      expect(w).not.toContain('usePermissions()')
    })
  }

  it('the seeded call still reaches the native container', () => {
    expect(transform(seeded, { target: 'swift' }).code).toContain(
      'PyreonPermissions(["posts.*"])',
    )
    expect(transform(seeded, { target: 'kotlin' }).code).toContain(
      'PyreonPermissions(setOf("posts.*"))',
    )
  })
})

describe('a provider that lowers does not claim it does not', () => {
  it('a literal <PermissionsProvider> emits no unlowered-module warning', () => {
    const w = transform(
      `import { PermissionsProvider, usePermissions } from '@pyreon/permissions'
       function Inner() { const can = usePermissions(); return <Text>{can('a') ? 'y' : 'n'}</Text> }
       export function App() {
         return <PermissionsProvider permissions={{ 'posts.*': true }}><Inner /></PermissionsProvider>
       }`,
      { target: 'swift' },
    ).warnings.join('\n')
    // It used to warn "has NO native lowering" directly above the injection
    // it performs, advising a <Web> escape hatch for working code.
    expect(w).toBe('')
  })

  it('the grants reach the native container on both targets', () => {
    const src = `import { PermissionsProvider, usePermissions } from '@pyreon/permissions'
      function Inner() { const can = usePermissions(); return <Text>{can('a') ? 'y' : 'n'}</Text> }
      export function App() {
        return <PermissionsProvider permissions={{ 'posts.*': true, 'billing.**': true }}><Inner /></PermissionsProvider>
      }`
    expect(transform(src, { target: 'swift' }).code).toContain(
      'PyreonPermissions(["posts.*", "billing.**"])',
    )
    expect(transform(src, { target: 'kotlin' }).code).toContain(
      'PyreonPermissions(setOf("posts.*", "billing.**"))',
    )
  })

  it('a NON-literal permissions map still declines — it cannot be baked in', () => {
    const w = transform(
      `import { PermissionsProvider } from '@pyreon/permissions'
       export function App() { return <PermissionsProvider permissions={fromServer}><Text>x</Text></PermissionsProvider> }`,
      { target: 'swift' },
    ).warnings.join('\n')
    expect(w).toContain('cannot be baked')
    expect(w).toContain('every check below it denies')
  })
})

// `usePermissions([])` — an explicit EMPTY grant list. The web runtime selects
// the self-contained mode by PRESENCE, so `[]` is a deny-all instance, never a
// fallback to the provider (an authorization-widening footgun when the list is
// computed to empty). The native lowering has to make the same choice, or one
// source line grants on device what it denies in a browser.
describe('usePermissions([]) is a deny-all container on every target', () => {
  const explicitEmpty = `import { PermissionsProvider, usePermissions } from '@pyreon/permissions'
import { Text } from '@pyreon/primitives'
function Inner() {
  const can = usePermissions([])
  return <Text>{can('posts.edit') ? 'y' : 'n'}</Text>
}
export function App() {
  return <PermissionsProvider permissions={{ 'posts.*': true }}><Inner /></PermissionsProvider>
}`

  it('swift: an empty container, not the environment provider', () => {
    const code = transform(explicitEmpty, { target: 'swift' }).code
    expect(code).toContain('= PyreonPermissions()')
    expect(code).not.toMatch(/@Environment\(\\\.pyreonPermissions\) private var can\b/)
  })

  it('kotlin: an empty container, not the CompositionLocal', () => {
    const code = transform(explicitEmpty, { target: 'kotlin' }).code
    expect(code).toContain('val can = remember { PyreonPermissions() }')
    expect(code).not.toContain('val can = LocalPyreonPermissions.current')
  })

  it('an explicit empty list is intentional, so it does not warn', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const w = transform(
        `import { usePermissions } from '@pyreon/permissions'
import { Text } from '@pyreon/primitives'
export function App() {
  const can = usePermissions([])
  return <Text>{can('posts.edit') ? 'y' : 'n'}</Text>
}`,
        { target },
      ).warnings.join('\n')
      expect(w).not.toContain('usePermissions()')
    }
  })
})
