// Phase 4 — `usePermissions()` native emit. Own test file (not
// canonical-primitives.test.ts) so it doesn't append-conflict with the
// in-flight emit PRs that also extend that file.
//
// `const can = usePermissions(['posts.edit', 'posts.*'])` → a PyreonPermissions
// reactive container seeded with the literal grant keys. Swift emits
// `@State private var can = PyreonPermissions([...])`; Kotlin a
// `remember { PyreonPermissions(setOf(...)) }`. Reads are METHOD CALLS
// (`can.can("x")` / `cannot` / `all` / `any` / `grant` / `revoke` / `set`) —
// unlike useFetch / useForm there is NO `.value` field-read rewrite, since
// the methods read the underlying reactive set internally and return Bool.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

describe('Phase 4 — usePermissions() native emit', () => {
  it('Swift: @State PyreonPermissions seeded with the literal grant keys', () => {
    const out = transform(
      `
      export function Gate() {
        const can = usePermissions(['posts.edit', 'posts.*'])
        return <Show when={() => can.can('posts.edit')}><Text>Edit</Text></Show>
      }
      `,
      { target: 'swift' },
    ).code
    expect(out).toContain('@State private var can = PyreonPermissions(["posts.edit", "posts.*"])')
    // Method-call read — plain, no `.value` rewrite.
    expect(out).toContain('can.can("posts.edit")')
    expect(out).not.toContain('can.can("posts.edit").value')
  })

  it('Kotlin: remember { PyreonPermissions(setOf(...)) } seeded with grants', () => {
    const out = transform(
      `
      export function Gate() {
        const can = usePermissions(['posts.edit', 'posts.*'])
        return <Show when={() => can.can('posts.edit')}><Text>Edit</Text></Show>
      }
      `,
      { target: 'kotlin' },
    ).code
    expect(out).toContain(
      'val can = remember { PyreonPermissions(setOf("posts.edit", "posts.*")) }',
    )
    // Method call reads plainly — no `.value` on the result.
    expect(out).toContain('can.can("posts.edit")')
    expect(out).not.toContain('can.can("posts.edit").value')
  })

  it('bare usePermissions() emits a default-constructed container (empty grants)', () => {
    const swift = transform(
      `export function Blank() { const can = usePermissions(); return <Text>x</Text> }`,
      { target: 'swift' },
    ).code
    expect(swift).toContain('@State private var can = PyreonPermissions()')

    const kotlin = transform(
      `export function Blank() { const can = usePermissions(); return <Text>x</Text> }`,
      { target: 'kotlin' },
    ).code
    expect(kotlin).toContain('val can = remember { PyreonPermissions() }')
  })

  it('non-literal grant entries drop from the PyreonPermissions seed (string keys only)', () => {
    const out = transform(
      `
      export function Mixed() {
        const role = 'admin'
        const can = usePermissions(['posts.edit', role])
        return <Text>x</Text>
      }
      `,
      { target: 'swift' },
    ).code
    // Only the string-literal grant survives in the SEED; the identifier
    // reference is dropped from the grant array.
    expect(out).toContain('PyreonPermissions(["posts.edit"])')
    // `role` is NOT seeded into the permissions container (the non-literal
    // grant is dropped from the array).
    expect(out).not.toContain('PyreonPermissions(["posts.edit", role])')
    // Phase 5b: `const role = 'admin'` ITSELF now emits as a value-const
    // `let` (component-body consts used to be dropped entirely). That's
    // correct + orthogonal to the grant-seed drop — the old
    // `not.toContain('role')` assertion conflated the two.
    expect(out).toContain('let role = "admin"')
  })
})
