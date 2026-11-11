// `Math.round` returns a NUMBER in JS, and PMTC types it Double on both targets (as it does floor/ceil/trunc).
//
// THE BUG: Kotlin emitted `java.lang.Math.round(double)`, which returns a LONG. The inferred and emitted types then
// disagreed, so an ordinary percentage — `const pct = computed(() => Math.round((value / max) * 100))` rendered as
// `{pct()}%` — fed a Long into `pyreonNumString(Double)` and kotlinc rejected it ("actual type is 'Long', but
// 'Double' was expected"). No warning. Swift was fine (it lowers round to a Double expression).
import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const APP = [
  "import { Text, Stack } from '@pyreon/primitives'",
  "import { signal, computed } from '@pyreon/reactivity'",
  'export function App() {',
  '  const value = signal(3)',
  '  const max = signal(7)',
  '  const pct = computed(() => Math.round((value() / max()) * 100))',
  '  const half = computed(() => Math.round(2.5) * 0.5)',
  '  return (',
  '    <Stack>',
  '      <Text>{String(pct())}%</Text>',
  '      <Text>{half()}</Text>',
  '    </Stack>',
  '  )',
  '}',
].join('\n')

describe('Kotlin', () => {
  const out = transform(APP, { target: 'kotlin' })

  it('lowers to the runtime pyreonRound, a Double as PMTC infers (java.lang.Math.round is a Long and turns NaN into 0, #4258)', () => {
    expect(out.warnings).toEqual([])
    expect(out.code).toContain('pyreonRound(((value).toDouble() / (max).toDouble()) * 100L)')
    expect(out.code).toContain('pyreonRound(2.5) * 0.5')
  })

  it.skipIf(!isKotlincAvailable())('compiles', () => {
    const r = validateKotlin(out.code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  }, 180_000)
})

describe('Swift (unchanged control)', () => {
  const out = transform(APP, { target: 'swift' })

  it('still lowers round to a Double expression', () => {
    expect(out.warnings).toEqual([])
    expect(out.code).toContain('pyreonRound(')
  })

  it.skipIf(!isSwiftcAvailable())('typechecks', () => {
    const r = validateSwiftWithStubs(out.code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  })
})
