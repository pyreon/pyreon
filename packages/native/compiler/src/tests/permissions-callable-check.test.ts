// A permission-gated screen written ONCE runs on all three targets.
//
// `@pyreon/permissions` returns a CALLABLE instance, so the documented check is
// `can('posts.edit')` — a call on the instance itself, not `can.can(...)`. Both
// native runtimes already answer that shape (`callAsFunction` on Swift,
// `operator fun invoke` on Kotlin), so the emit needs no rewrite; this locks
// that, because the property is invisible in the emit and easy to break by
// "tidying" either runtime.
//
// The half that was genuinely broken was the WEB one, fixed alongside: the
// seeded `usePermissions(['posts.edit'])` form is what the compiler lowers to,
// and on the web it threw `must be used within <PermissionsProvider>`. So the
// identical source ran on two targets and died in a browser.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const SRC = `import { usePermissions } from '@pyreon/permissions'
import { Stack, Text } from '@pyreon/primitives'
export function C() {
  const can = usePermissions(['posts.edit'])
  return (<Stack><Text>{String(can('posts.edit'))}</Text></Stack>)
}`

describe('the web-canonical callable permission check crosses', () => {
  it('seeds the native container from the literal grants (Swift)', () => {
    const { code } = transform(SRC, { target: 'swift' })
    expect(code).toContain('PyreonPermissions(["posts.edit"])')
    expect(code).toContain('can("posts.edit")')
  })

  it('seeds the native container from the literal grants (Kotlin)', () => {
    const { code } = transform(SRC, { target: 'kotlin' })
    expect(code).toContain('can("posts.edit")')
  })

  // These two are the load-bearing ones: they are what proves the runtimes are
  // callable. An emit assertion alone cannot — `can("posts.edit")` is a string
  // either way, and only the compiler knows whether the type accepts it.
  it.skipIf(!isSwiftcAvailable())('the emitted Swift typechecks against the runtime surface', () => {
    const r = validateSwiftWithStubs(transform(SRC, { target: 'swift' }).code)
    expect(r.ok, r.error).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the emitted Kotlin compiles against the runtime surface', () => {
    const r = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(r.ok, r.error).toBe(true)
  })
})
