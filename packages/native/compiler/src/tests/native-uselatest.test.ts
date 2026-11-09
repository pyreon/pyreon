// `useLatest(literal)` native emit — a reference box, NOT view state.
//
// The web ref is `{ current }`: reading or writing `.current` never re-renders. So the port is a `PyreonLatest<T>` class
// instance (held by a `@State` on SwiftUI, `remember`ed on Compose), never a state value whose write would recompose.
// A non-literal initial value is a NAMED warning that drops the hook: a SwiftUI `@State` default cannot read props.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const SRC = `
import { Stack, Text, Button } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
import { useLatest } from '@pyreon/hooks'
export function Taps() {
  const taps = signal(0)
  const last = useLatest(0)
  return (
    <Stack>
      <Text>{() => 'taps ' + taps()}</Text>
      <Button onPress={() => { last.current = taps(); taps.set(taps() + 1) }}>tap</Button>
      <Text>{'last ' + last.current}</Text>
    </Stack>
  )
}
`

const NON_LITERAL = SRC.replace('useLatest(0)', 'useLatest(taps())')

const swiftOf = (src: string) => transform(src, { target: 'swift' })
const kotlinOf = (src: string) => transform(src, { target: 'kotlin' })

describe('useLatest() emit', () => {
  it('Swift: a PyreonLatest box in a @State, written and read through .current', () => {
    const r = swiftOf(SRC)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('@State private var last = PyreonLatest<Int>(0)')
    expect(r.code).toContain('last.current = taps')
    expect(r.code).toContain('last.current')
  })

  it('Kotlin: a remembered PyreonLatest box (a plain field, so a write does not recompose)', () => {
    const r = kotlinOf(SRC)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('val last = remember { PyreonLatest<Long>(0L) }')
    expect(r.code).toContain('last.current = ')
    expect(r.code).not.toContain('last.current.value')
  })

  it('a non-literal initial value is a named warning that drops the hook', () => {
    for (const r of [swiftOf(NON_LITERAL), kotlinOf(NON_LITERAL)]) {
      expect(r.warnings.join('\n')).toContain('useLatest()')
      expect(r.warnings.join('\n')).toContain('literal')
      expect(r.code).not.toContain('PyreonLatest')
    }
  })

  it.runIf(isSwiftcAvailable())('Swift emit typechecks against the stubs', () => {
    const v = validateSwiftWithStubs(swiftOf(SRC).code)
    expect(v.ok, v.error).toBe(true)
  })

  it.runIf(isKotlincAvailable())('Kotlin emit typechecks against the stubs', () => {
    const v = validateKotlin(kotlinOf(SRC).code)
    expect(v.ok, v.error).toBe(true)
  })
})
