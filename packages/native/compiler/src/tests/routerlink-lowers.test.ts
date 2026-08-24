// `<RouterLink to="/x">` from @pyreon/router is the same concept as `<Link>`
// and carries the same `to` prop, but it had no entry in either emitter's tag
// dispatch. So it fell through to the unknown-tag path and emitted
//
//     RouterLink(to: "/about") { … }
//
// a type that exists in neither runtime — the Swift router ships `PyreonLink`,
// which `<Link>` already maps to. Uncompilable, with ZERO warnings.
//
// It survived because the native-coverage gate judges a package by TRANSFORM
// WARNINGS and never compiles the emit, so a warning-free uncompilable emit
// reads as "crosses". Found by compiling every registry snippet on real swiftc:
// 9 of 31 failed, of which this was one.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, validateSwiftWithStubs } from '../validate'

const SRC = `
import { RouterLink } from '@pyreon/router'
import { Stack, Text } from '@pyreon/primitives'
export function Nav() {
  return (<Stack><RouterLink to="/about"><Text>About</Text></RouterLink></Stack>)
}
`

describe('<RouterLink> lowers to the router runtime, not a verbatim tag', () => {
  it('Swift emits PyreonLink, never a bare RouterLink', () => {
    const { code } = transform(SRC, { target: 'swift' })
    expect(code).toContain('PyreonLink("/about")')
    expect(code).not.toContain('RouterLink(')
  })

  it('Kotlin emits PyreonLink, never a bare RouterLink', () => {
    const { code } = transform(SRC, { target: 'kotlin' })
    expect(code).toContain('PyreonLink("/about")')
    expect(code).not.toContain('RouterLink(')
  })

  it('carries the label through', () => {
    expect(transform(SRC, { target: 'swift' }).code).toContain('Text("About")')
  })

  it('lowers without warnings', () => {
    expect(transform(SRC, { target: 'swift' }).warnings).toEqual([])
  })

  it.runIf(isSwiftcAvailable())('the emit COMPILES — the assertion the tag-name check cannot make', () => {
    // The string assertions above would pass against any plausible-looking
    // symbol. Only the compiler proves the emitted call resolves, which is the
    // whole reason this bug reached a shipped package unnoticed.
    const v = validateSwiftWithStubs(transform(SRC, { target: 'swift' }).code)
    expect(v.ok, v.error).toBe(true)
  })
})
