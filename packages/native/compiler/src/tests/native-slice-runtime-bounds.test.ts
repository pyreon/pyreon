// `slice` with a bound whose sign is not known at compile time.
//
// Literal bounds lower to the platform's own operations (`suffix(2)`, `dropFirst(1).dropLast(1)` / `takeLast(2)`,
// `drop(1).dropLast(1)`), because the sign is known. A variable bound used to take the same path — `dropFirst(n)`,
// `suffix(n)`, `drop(n)`, `takeLast(n)` — which TRAP or THROW when `n` is negative at runtime, while JavaScript reads
// a negative bound as counting from the end; and `slice(n, -m)` did not lower at all. Every non-literal bound now
// goes through the runtime's `pyreonSlice`, whose semantics are JavaScript's (tested in each runtime's own suite).

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const comp = (expr: string): string => `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function P() {
  const xs = signal([1, 2, 3, 4, 5])
  const word = signal('hello')
  const n = signal(2)
  const r = computed(() => ${expr})
  return <Stack><Text>{r().length}</Text></Stack>
}`

const swift = (expr: string) => transform(comp(expr), { target: 'swift' })
const kotlin = (expr: string) => transform(comp(expr), { target: 'kotlin' })

describe('slice bounds on native', () => {
  it('literal bounds keep the platform idioms (the sign is known)', () => {
    expect(swift('xs().slice(-2)').code).toContain('Array(xs.suffix(2))')
    expect(swift('xs().slice(1, -1)').code).toContain('Array(xs.dropFirst(1).dropLast(1))')
    expect(kotlin('xs().slice(-2)').code).toContain('xs.takeLast(2)')
    expect(kotlin('xs().slice(1, -1)').code).toContain('xs.drop(1).dropLast(1)')
  })

  for (const expr of ['xs().slice(n())', 'xs().slice(-n())', 'xs().slice(n(), -n())', 'word().slice(n(), -1)']) {
    describe(expr, () => {
      it('goes through pyreonSlice on both targets, with no warning', () => {
        const s = swift(expr)
        const k = kotlin(expr)
        expect(s.warnings).toEqual([])
        expect(k.warnings).toEqual([])
        expect(s.code).toMatch(/pyreonSlice\((xs|word), /)
        expect(k.code).toMatch(/pyreonSlice\((xs|word), /)
        // Never the trapping idioms with a variable bound.
        expect(s.code).not.toMatch(/(dropFirst|suffix)\(-?n\)/)
        expect(k.code).not.toMatch(/(drop|takeLast)\(\(?-?n/)
      })

      it.runIf(isSwiftcAvailable())('Swift emit typechecks', () => {
        const v = validateSwiftWithStubs(swift(expr).code)
        expect(v.ok, v.error).toBe(true)
      })

      it.runIf(isKotlincAvailable())('Kotlin emit typechecks', () => {
        const v = validateKotlin(kotlin(expr).code)
        expect(v.ok, v.error).toBe(true)
      })
    })
  }
})
