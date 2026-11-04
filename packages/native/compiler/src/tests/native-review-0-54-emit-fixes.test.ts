// Four emit defects found by the 0.54 pre-release review, each of which produced code that did not compile — or
// that behaved differently on one target — with NO warning:
//
// 1. A zero-argument helper called from ANOTHER helper (`String(k())`) emitted the bare reference `k`: module scope
//    did not see the file's helpers as callable, so the call fell through to the signal-read branch.
// 2. A fractional `slice` bound (`xs.slice(0, xs.length / 2)`) reached Swift's `pyreonSlice` as a `Double`.
// 3. `substring` with a bound past the end (`title.substring(0, 10)`) THREW on Kotlin, a negative or swapped bound
//    trapped (or did not compile) on Swift; JavaScript clamps and swaps.
// 4. A `throw` inside a rethrowing array callback (`xs.map(s => { throw … })`) became `fatalError` on Swift, while
//    the web and Kotlin propagate it to the caller's `try`/`catch`.
import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable, isSwiftUIAvailable, validateSwiftTypecheck } from '../validate'

const head = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
`
const emit = (src: string, target: 'swift' | 'kotlin') => transform(src, { target })

const helpers = `${head}
function k(): number { return 1 }
function label(): string { return 'L' + String(k()) }
function lab2(): string { return \`v\${k()}\` }
function lab3(): number { return k() + 1 }
function App() {
  const r = signal(label())
  return (<Stack><Text>{r()}</Text><Text>{lab2()}</Text><Text>{String(lab3())}</Text></Stack>)
}`

const slices = `${head}
function firstHalf(xs: number[]): number[] { return xs.slice(0, xs.length / 2) }
function App() {
  const xs = signal([1, 2, 3, 4, 5])
  const ratio = signal(0.5)
  const r = computed(() => xs().slice(0, Math.floor(xs().length * ratio())))
  return (<Stack><Text>{String(r().length + firstHalf(xs()).length)}</Text></Stack>)
}`

const substrings = `${head}
type P = { name?: string }
function trunc(s: string): string { return s.substring(0, 10) }
function from(s: string, i: number): string { return s.substring(i) }
function swap(s: string): string { return s.substring(3, 1) }
function half(s: string): string { return s.substring(0, s.length / 2) }
function opt(p: P): string | undefined { return p.name?.substring(1) }
function App() {
  const t = signal('hello')
  const n = signal(3)
  return (<Stack><Text>{trunc(t())}{from(t(), n())}{swap(t())}{half(t())}{opt({ name: 'abc' }) ?? ''}</Text></Stack>)
}`

const rethrowing = `${head}
type Item = { id: number; name: string }
function need(s: string): number { if (s === '') throw new Error('empty'); return s.length }
function lens(xs: string[]): number[] {
  return xs.map((s) => { if (s === '') throw new Error('bad'); return s.length })
}
function total(xs: string[]): number { return xs.reduce((acc, s) => acc + need(s), 0) }
function firstOk(xs: Item[]): Item | undefined { return xs.find((i) => need(i.name) > 1) }
function check(xs: string[]): boolean { return xs.every((s) => need(s) > 0) }
function App() {
  const out = signal('')
  const go = () => {
    try {
      out.set(String(lens(['a', '']).length) + String(total(['ab'])) + String(check(['x'])) + (firstOk([{ id: 1, name: 'ab' }])?.name ?? ''))
    } catch (e) {
      out.set(e.message)
    }
  }
  const inline = () => {
    try { out.set(String(['a', ''].map((s) => need(s)).length)) } catch (e) { out.set(String(e)) }
  }
  return (<Stack><Text>{out()}</Text><Button onPress={go}>Go</Button><Button onPress={inline}>In</Button></Stack>)
}`

describe('a zero-argument helper called from another helper keeps its call', () => {
  it('Swift and Kotlin call `k()`, never reference `k`', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const out = emit(helpers, target).code
      expect(out).toMatch(/String\(k\(\)\)|\(k\(\)\)\.toString\(\)/)
      expect(out).toMatch(/\\\(k\(\)\)|\$\{k\(\)\}/)
      expect(out).toMatch(/k\(\) \+ 1/)
    }
  })
  it.runIf(isSwiftcAvailable())('Swift typechecks', () => {
    const v = validateSwiftWithStubs(emit(helpers, 'swift').code)
    expect(v.ok, v.error).toBe(true)
  })
  it.runIf(isKotlincAvailable())('Kotlin compiles', () => {
    const v = validateKotlin(emit(helpers, 'kotlin').code)
    expect(v.ok, v.error).toBe(true)
  }, 180_000)
})

describe('a fractional slice bound', () => {
  it('Swift converts it with pyreonSliceIndex (JS truncation, NaN → 0), never a trapping Int(…)', () => {
    const out = emit(slices, 'swift').code
    expect(out).toContain('pyreonSlice(xs, 0, pyreonSliceIndex(Double(xs.count) / Double(2)))')
    expect(out).toContain('pyreonSliceIndex(floor(')
  })
  it.runIf(isSwiftcAvailable())('Swift typechecks against the stubs', () => {
    const v = validateSwiftWithStubs(emit(slices, 'swift').code)
    expect(v.ok, v.error).toBe(true)
  })
  it.runIf(isSwiftUIAvailable())('Swift typechecks against real SwiftUI and the real PyreonSlice.swift', () => {
    const v = validateSwiftTypecheck(emit(slices, 'swift').code)
    expect(v.ok, v.error).toBe(true)
  })
})

describe('substring has JavaScript semantics on both targets', () => {
  it('Kotlin always goes through pyreonSubstring (its own substring throws past the end)', () => {
    const out = emit(substrings, 'kotlin').code
    expect(out).toContain('fun trunc(s: String): String = pyreonSubstring(s, (0L).toLong(), (10L).toLong())')
    expect(out).toContain('p.name?.let { pyreonSubstring(it, (1L).toLong()) }')
    expect(out).not.toMatch(/\.substring\(/)
  })
  it('Swift keeps the clamping idiom for in-order literals and uses the runtime otherwise', () => {
    const out = emit(substrings, 'swift').code
    expect(out).toContain('String(s.dropFirst(0).prefix(max(0, (10) - (0))))')
    expect(out).toContain('pyreonSubstring(s, i)')
    expect(out).toContain('pyreonSubstring(s, 3, 1)')
    expect(out).toContain('pyreonSubstring(s, 0, pyreonSliceIndex(')
    expect(out).toContain('p.name.map { pyreonSubstring($0, 1) }')
  })
  it.runIf(isSwiftcAvailable())('Swift typechecks', () => {
    const v = validateSwiftWithStubs(emit(substrings, 'swift').code)
    expect(v.ok, v.error).toBe(true)
  })
  it.runIf(isSwiftUIAvailable())('Swift typechecks against real SwiftUI and the real PyreonSlice.swift', () => {
    const v = validateSwiftTypecheck(emit(substrings, 'swift').code)
    expect(v.ok, v.error).toBe(true)
  })
  it.runIf(isKotlincAvailable())('Kotlin compiles', () => {
    const v = validateKotlin(emit(substrings, 'kotlin').code)
    expect(v.ok, v.error).toBe(true)
  }, 180_000)
})

describe('a throw inside a rethrowing array callback propagates to the caller', () => {
  it('Swift: the helper is `throws`, the call is `try`, the closure throws — no fatalError', () => {
    const r = emit(rethrowing, 'swift')
    expect(r.code).toContain('func lens(_ xs: [String]) throws -> [Int] { (try xs.map({ s in')
    expect(r.code).toContain('throw PyreonThrown(message: "bad")')
    expect(r.code).toContain('func total(_ xs: [String]) throws -> Int { (try xs.reduce(')
    expect(r.code).toContain('(try xs.first(where:')
    expect(r.code).toContain('(try xs.allSatisfy(')
    expect(r.code).not.toContain('fatalError')
    expect(r.code).not.toContain('try!')
    expect(r.warnings.join('\n')).not.toContain('TERMINATES')
  })
  it('Kotlin: no "terminates" warning — an inline lambda propagates the exception', () => {
    expect(emit(rethrowing, 'kotlin').warnings.join('\n')).not.toContain('TERMINATES')
  })
  it.runIf(isSwiftcAvailable())('Swift typechecks', () => {
    const v = validateSwiftWithStubs(emit(rethrowing, 'swift').code)
    expect(v.ok, v.error).toBe(true)
  })
})
