// An integer literal where a Double is EXPECTED (#3956 items 2 and 4).
//
// Kotlin does not coerce an integer literal into a Double, so every one of these
// shared-source lines compiled on the web and iOS and failed `gradle`:
//
//   const ZERO: Double = 0                      -> private val ZERO: Double = 0L
//   const MARKS: Double[] = [0, 1]              -> listOf(0L, 1L) as List<Double>
//   function zero(): Double { return 0 }        -> fun zero(): Double = 0L
//   half(geo.latitude ?? 0)                     -> half(geo.latitude.value ?: 0L)
//
// The issue named two lines (a module const and a `??` partner); the probe showed
// the same defect in every position that names a Double, and Swift losing the
// annotation on a LOCAL (`const x: Double = 0` -> `let x = 0`, an Int). One pass
// now types them all (`contextual-double-literals.ts`), so this spec states the
// RULE — the expected type reaches the literal — across its positions rather than
// the two spellings that were reported.
//
// Additive in both directions, and the control group proves it: an Int context is
// never widened, and a Double never reaches a position that is not a Double's.

import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const SOURCE = `type Double = number
const TOP: Double = 0
const MARKS: Double[] = [0, 1]
function half(v: Double): Double { return v / 2 }
function zero(): Double { return 0 }
function pick(flag: boolean): Double { return flag ? 1 : 0 }
function scale(v: Double, by: Double = 1): Double { return v * by }
export function App() {
  const local: Double = 0
  const a = half(0)
  const geo = useGeolocation()
  const b = half(geo.latitude ?? 0)
  const s = signal<Double>(0)
  return (
    <Stack>
      <Text>{local}{a}{b}{zero()}{pick(true)}{TOP}{s()}{scale(2)}</Text>
    </Stack>
  )
}`

const emit = (target: 'swift' | 'kotlin', source = SOURCE) => transform(source, { target }).code
const line = (code: string, needle: string) => code.split('\n').find((l) => l.includes(needle))?.trim() ?? ''

describe('an integer literal in a Double position is a Double', () => {
  it('Kotlin: a module const, a Double array, a return, a call argument, a ?? partner, a local, a signal and a default', () => {
    const k = emit('kotlin')
    expect(line(k, 'val TOP')).toBe('private val TOP: Double = 0.0')
    expect(line(k, 'val MARKS')).toBe('private val MARKS: List<Double> = listOf(0.0, 1.0)')
    expect(line(k, 'fun zero')).toBe('fun zero(): Double = 0.0')
    expect(line(k, 'fun pick')).toContain('if (flag) 1.0 else 0.0')
    expect(line(k, 'val a =')).toBe('val a = half(0.0)')
    expect(line(k, 'val b =')).toContain('?: 0.0')
    expect(line(k, 'val local')).toBe('val local = 0.0')
    expect(line(k, 'mutableStateOf')).toContain('mutableStateOf(0.0)')
    expect(line(k, 'fun scale')).toContain('by: Double = 1.0')
    // The call site passing an integer to the defaulted parameter's FIRST slot.
    expect(k).toContain('scale(2.0)')
  })

  it('Swift: the local keeps a Double type (the annotation is dropped, so the literal must carry it)', () => {
    const s = emit('swift')
    expect(line(s, 'let local')).toBe('let local = 0.0')
    expect(line(s, 'let a =')).toBe('let a = half(0.0)')
    expect(line(s, 'let TOP')).toBe('private let TOP: Double = 0.0')
  })

  // The control group: an integer context must be untouched, or the pass would
  // widen every number in every app.
  it('an INT context is never widened', () => {
    const intOnly = `const N: number = 3
function inc(v: number): number { return v + 1 }
export function App() {
  const n: number = 0
  const m = inc(2)
  return (<Stack><Text>{N}{n}{m}</Text></Stack>)
}`
    const k = emit('kotlin', intOnly)
    expect(line(k, 'val N')).toBe('private val N: Long = 3L')
    expect(line(k, 'val n')).toBe('val n = 0L')
    expect(line(k, 'val m')).toBe('val m = inc(2L)')
    const s = emit('swift', intOnly)
    expect(line(s, 'let n')).toBe('let n = 0')
    expect(line(s, 'let m')).toBe('let m = inc(2)')
  })

  it('a ?? whose left side is an Int is left alone', () => {
    const k = emit(
      'kotlin',
      `export function App() {
  const x = signal<number | null>(null)
  const y = (x() ?? 0) + 1
  return (<Stack><Text>{y}</Text></Stack>)
}`,
    )
    expect(k).toContain('?: 0L')
    expect(k).not.toContain('?: 0.0')
  })
})

describe('the widened emit survives the real toolchains', () => {
  it.skipIf(!isKotlincAvailable())('Kotlin: compiles on kotlinc', () => {
    const r = validateKotlin(emit('kotlin'))
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isSwiftcAvailable())('Swift: type-checks against the stub', () => {
    const r = validateSwiftWithStubs(emit('swift'))
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
