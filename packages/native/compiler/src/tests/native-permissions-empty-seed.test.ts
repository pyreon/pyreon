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
