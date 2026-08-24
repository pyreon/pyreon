// The `kinetic()` factory has no native analogue — it animates by toggling CSS
// classes and driving rAF over a real CSSOM, and neither SwiftUI nor Compose
// has one. That is a fine thing to decline. What was NOT fine is HOW it was
// declined: the binding fell through to the module-decl catch-all and emitted
//
//     private let Box = kinetic("div").preset("fade")   // Swift
//     private val Box = kinetic("div").preset("fade")   // Kotlin
//
// a call to a function that exists on neither target. So "we don't support
// this" reached the user as a broken native build, with the package-level
// web-only warning as the only (unspecific) hint.
//
// The repo already solved this twice — `createHttp()` metadata and
// `defineTheme()` are both skipped for exactly this reason. kinetic was never
// added. It needs one extra step those two don't: the binding is used as a JSX
// TAG, so skipping alone leaves `<Box>` unresolved. The tag rewrites to the
// canonical container, which is what the animation degrades to.
//
// Bisect-verified: restoring the catch-all emit fails the two "no unresolved
// binding" specs AND both toolchain specs, with the real compiler errors.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const SRC = `
import { kinetic } from '@pyreon/kinetic'
import { Stack, Text } from '@pyreon/primitives'
const Box = kinetic('div').preset('fade')
export function App() {
  return (<Stack><Box><Text>hi</Text></Box></Stack>)
}
`

/** Renamed import + a longer builder chain — the shape people actually write. */
const CHAINED_SRC = `
import { kinetic as k } from '@pyreon/kinetic'
import { Stack, Text } from '@pyreon/primitives'
const Fancy = k('section').preset('slide-up').duration(200)
export function App() {
  return (<Stack><Fancy><Text>hi</Text></Fancy></Stack>)
}
`

describe('kinetic() factory declines observably instead of emitting a broken binding', () => {
  it('Swift emits no unresolved `kinetic(...)` binding', () => {
    const { code } = transform(SRC, { target: 'swift' })
    expect(code).not.toContain('kinetic(')
    expect(code).not.toContain('let Box')
  })

  it('Kotlin emits no unresolved `kinetic(...)` binding', () => {
    const { code } = transform(SRC, { target: 'kotlin' })
    expect(code).not.toContain('kinetic(')
    expect(code).not.toContain('val Box')
  })

  it('`<Box>` lowers to the canonical container on both targets', () => {
    // Layout and children survive; only the animation is dropped. Two VStacks
    // because the outer <Stack> is one and <Box> degrades to the other.
    expect(transform(SRC, { target: 'swift' }).code).toContain('VStack')
    expect(transform(SRC, { target: 'kotlin' }).code).toContain('Column')
    expect(transform(SRC, { target: 'swift' }).code).toContain('Text("hi")')
  })

  it('warns BY NAME, and points at the animation that does cross', () => {
    // The package-level "is WEB-ONLY" line is too blunt to act on: it names the
    // package, not the binding, and does not say what happened to the element.
    const w = transform(SRC, { target: 'swift' }).warnings.filter(
      (x) => !x.includes('is WEB-ONLY'),
    )
    expect(w).toHaveLength(1)
    expect(w[0]).toContain('`Box`')
    expect(w[0]).toContain('plain container')
    expect(w[0]).toContain('<Transition show name="fade">')
  })

  it('detects a renamed import and a longer builder chain', () => {
    // Matching the OUTERMOST callee would see `.duration` and miss this; the
    // detector walks the chain to its base. A renamed import is why the local
    // name is collected rather than the literal `kinetic` being matched.
    const { code, warnings } = transform(CHAINED_SRC, { target: 'swift' })
    expect(code).not.toContain('k(')
    expect(code).not.toContain('let Fancy')
    expect(warnings.some((x) => x.includes('`Fancy`'))).toBe(true)
  })

  it('does NOT touch a same-named binding that is not the factory', () => {
    // Over-matching here would silently delete a real module const and rewrite
    // an unrelated component tag — a far worse failure than the one being fixed.
    const src = `
import { Stack, Text } from '@pyreon/primitives'
const kinetic = 'not-the-factory'
export function App() { return (<Stack><Text>{kinetic}</Text></Stack>) }
`
    const { code, warnings } = transform(src, { target: 'swift' })
    expect(code).toContain('kinetic')
    expect(warnings.filter((w) => w.includes('plain container'))).toHaveLength(0)
  })

  it.runIf(isSwiftcAvailable())('the Swift emit typechecks against the stubs', () => {
    const v = validateSwiftWithStubs(transform(SRC, { target: 'swift' }).code)
    expect(v.ok, v.error).toBe(true)
  })

  it.runIf(isKotlincAvailable())('the Kotlin emit compiles', () => {
    const v = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(v.ok, v.error).toBe(true)
  })
})
