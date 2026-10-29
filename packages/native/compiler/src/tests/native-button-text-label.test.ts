// A `<Button>` whose children are a text label lowers to ONE native Text.
//
// On the web `<Button>Tapped {n}</Button>` is one string ("Tapped 2"). The
// native emit made one view per child: a Compose Button holding `Text("Tapped ")`
// and `Text("${n}")` exposes two text fragments (TalkBack reads them apart and
// `hasText("Tapped 2")` matches neither), and a SwiftUI Button label with two
// Texts is a TupleView laid out per view rather than as one running label.
// `<Text>` already fused the same children into one interpolated string; the
// Button label now goes through that exact emitter.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const SRC = `
import { signal } from '@pyreon/reactivity'
import { Button, Icon, Stack } from '@pyreon/primitives'
export function App() {
  const n = signal(0)
  return (
    <Stack>
      <Button onPress={() => n.set(n() + 1)} data-testid="tap">Tapped {n()}</Button>
      <Button onPress={() => n.set(0)}><Icon name="check" /> Reset</Button>
    </Stack>
  )
}
`

describe('<Button> text label', () => {
  it('a mixed text label is ONE Text on both targets', () => {
    const swift = transform(SRC, { target: 'swift' })
    expect(swift.warnings).toEqual([])
    expect(swift.code).toContain('Text(verbatim: "Tapped \\(n)")')
    expect(swift.code).not.toContain('Text("Tapped ")')
    const kotlin = transform(SRC, { target: 'kotlin' })
    expect(kotlin.warnings).toEqual([])
    expect(kotlin.code).toContain('Text(text = "Tapped ${n}")')
    expect(kotlin.code).not.toContain('Text(text = "Tapped ")')
  })

  it('a label containing JSX keeps one view per child', () => {
    const swift = transform(SRC, { target: 'swift' }).code
    expect(swift).toContain('Image(systemName: "checkmark")')
    expect(swift).toContain('Text(" Reset")')
    const kotlin = transform(SRC, { target: 'kotlin' }).code
    expect(kotlin).toContain('Text(text = " Reset")')
  })

  it.runIf(isSwiftcAvailable())('Swift emit typechecks against the stubs', () => {
    const v = validateSwiftWithStubs(transform(SRC, { target: 'swift' }).code)
    expect(v.ok, v.error).toBe(true)
  })

  it.runIf(isKotlincAvailable())('Kotlin emit typechecks against the stubs', () => {
    const v = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(v.ok, v.error).toBe(true)
  })
})
