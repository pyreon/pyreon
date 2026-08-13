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

  // The invariant this protected — a bare `usePermissions()` still produces
  // a usable container — is unchanged. What changed is WHERE the container
  // comes from: a default-constructed one had an empty grant set, so every
  // check denied while the web read the provider's grants. It now reads the
  // provider through the environment / CompositionLocal, which is what makes
  // the web-correct call work rather than silently deny.
  it('bare usePermissions() reads the provider instead of an empty container', () => {
    const src = `export function Blank() { const can = usePermissions(); return <Text>x</Text> }`

    const swift = transform(src, { target: 'swift' }).code
    expect(swift).toContain('@Environment(\\.pyreonPermissions) private var can')
    // The emitted env key legitimately DEFAULTS to an empty container; what
    // must be gone is the per-call-site construction that ignored the provider.
    expect(swift).not.toContain('@State private var can = PyreonPermissions()')

    const kotlin = transform(src, { target: 'kotlin' }).code
    expect(kotlin).toContain('val can = LocalPyreonPermissions.current')
    expect(kotlin).not.toContain('val can = remember { PyreonPermissions() }')
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

  // The mutators. This file's header has always documented `grant` / `revoke`
  // / `set` as METHOD CALLS, but the emit did not honour `set`: the generic
  // `signal.set(v)` -> `signal = v` lowering fired on any identifier receiver
  // that was not in a hand-maintained exclusion list, so `p.set(...)` became
  // an ASSIGNMENT to a non-assignable receiver. Both targets rejected it —
  // Swift "cannot assign value of type 'Set<String>'", Kotlin "'val' cannot
  // be reassigned". Correct code, invalid output.
  describe('mutators stay method calls, not signal writes', () => {
    const src = `
      export function Gate() {
        const p = usePermissions(['posts.*'])
        const f = () => { p.grant('a'); p.revoke('b'); p.set(new Set(['c'])) }
        return <Text>x</Text>
      }
      `

    it('Swift: p.set(...) is a call, never `p = ...`', () => {
      const out = transform(src, { target: 'swift' }).code
      expect(out).toContain('p.set(')
      expect(out).toContain('p.grant("a")')
      expect(out).toContain('p.revoke("b")')
      // The assignment shape the signal-write lowering used to produce.
      expect(out).not.toMatch(/\bp = Set\(/)
    })

    it('Kotlin: p.set(...) is a call, never `p = ...`', () => {
      const out = transform(src, { target: 'kotlin' }).code
      expect(out).toContain('p.set(')
      expect(out).toContain('p.grant("a")')
      expect(out).toContain('p.revoke("b")')
      expect(out).not.toMatch(/\bp = \(/)
    })

    it('a REAL signal still lowers `.set(v)` to an assignment', () => {
      // The inversion must not cost the behaviour it is gating: a tracked
      // signal declaration keeps the assignment lowering.
      const out = transform(
        `
        export function Counter() {
          const n = signal(0)
          const f = () => { n.set(5) }
          return <Text>x</Text>
        }
        `,
        { target: 'swift' },
      ).code
      expect(out).toContain('n = 5')
    })
  })
})
