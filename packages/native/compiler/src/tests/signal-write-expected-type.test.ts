// A signal WRITE is typed by the signal, not by the written literal's shape.
//
// `signal<B[]>(…)` followed by `xs.set([{ value, label }])` must construct `B`.
// Typed by shape alone, the literal took the FIRST struct whose fields matched
// exactly — here `A` — and the assignment `xs = [A(…)]` to a `[B]` state did
// not compile, while the declaration beside it (typed by its annotation) did.
// Found through `<Select>` in the tasks showcase: the file also imports
// @pyreon/charts, whose engine declares `PolarTick { value, label }`, and the
// option list's `.set([...])` built PolarTicks into a `[SelectOption]` state.

import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const source = `
  import { signal } from '@pyreon/reactivity'
  import { Stack, Button, Text } from '@pyreon/primitives'
  type A = { value: string; label: string }
  type B = { value: string; label: string; extra?: number }
  export function Writer() {
    const first = signal<A[]>([])
    const xs = signal<B[]>([{ value: 'a', label: 'Apple' }])
    return (
      <Stack>
        <Text>{String(xs().length + first().length)}</Text>
        <Button onPress={() => xs.set([{ value: 'x', label: 'Y' }])}>replace</Button>
      </Stack>
    )
  }
`

describe('a signal write constructs the element type of the SIGNAL', () => {
  it('Swift', () => {
    const { code } = transform(source, { target: 'swift' })
    expect(code).toContain('xs = [B(value: "x", label: "Y")]')
    expect(code).not.toContain('xs = [A(')
  })

  it('Kotlin', () => {
    const { code } = transform(source, { target: 'kotlin' })
    expect(code).toContain('xs = listOf(B(value = "x", label = "Y"))')
    expect(code).not.toContain('xs = listOf(A(')
  })

  it.skipIf(!isSwiftcAvailable())('and it compiles (Swift)', () => {
    const res = validateSwiftWithStubs(transform(source, { target: 'swift' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('and it compiles (Kotlin)', () => {
    const res = validateKotlin(transform(source, { target: 'kotlin' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  }, 180_000)
})
