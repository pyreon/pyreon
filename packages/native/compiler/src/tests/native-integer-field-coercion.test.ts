// A Double-typed value stored into an INTEGER-typed struct field (integer-field-coercion.ts).
//
// `type Todo = { id: number; title: string }` lowers `id` to Swift `Int` / Kotlin `Long`. `Date.now()` and
// `Math.floor` / `ceil` / `round` / `trunc` are whole numbers in JavaScript but Doubles natively, and neither target
// converts at an initializer or `.copy(…)` argument — so `todos.update((t) => [...t, { id: Date.now(), title }])`
// compiled with ZERO warnings and failed both builds (Swift "cannot convert value of type 'TimeInterval' (aka
// 'Double') to expected argument type 'Int'", Kotlin "actual type is 'Double', but 'Long' was expected").
//
// A whole-valued Double converts exactly; any other Double is NAMED (truncating would change the stored value).
//
// "Whole by construction" holds for FINITE inputs only: `Math.floor(NaN)` and `Math.round(x / 0)` reach the store as
// NaN / ±Infinity at runtime, where Swift's `Int(_:)` TRAPS (the app crashes) and Kotlin's `.toLong()` gives 0 or
// saturates. Swift therefore converts through the runtime's `pyreonInt`, which is Kotlin's `Double.toLong()`, and the
// last describe block below EXECUTES both targets' conversions on NaN and ±Infinity.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  isSwiftUIAvailable,
  validateSwiftTypecheck,
} from '../validate'

const head = `import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button, For } from '@pyreon/primitives'
type Todo = { id: number; title: string }
`

const whole = `${head}
function App() {
  const todos = signal<Todo[]>([])
  const add = (title: string) => todos.update((t) => [...t, { id: Date.now(), title }])
  const pick = (title: string) => todos.update((t) => [...t, { id: Math.floor(Math.random() * 1000), title }])
  const sec = (title: string) => todos.update((t) => [...t, { id: Math.round(Date.now() / 1000) + 1, title }])
  const halve = () => todos.update((t) => t.map((x) => ({ ...x, id: Math.trunc(x.id / 2) })))
  const stamp = () => todos.update((t) => t.map((x) => ({ ...x, id: Date.now() })))
  const next = (title: string) => todos.update((t) => [...t, { id: t.length + 1, title }])
  return (
    <Stack>
      <For each={todos()} by={(t) => t.id}>{(t) => <Text>{t.title}</Text>}</For>
      <Button onPress={() => { add('a'); pick('b'); sec('c'); halve(); stamp(); next('d') }}>add</Button>
    </Stack>
  )
}`

const emit = (src: string, target: 'swift' | 'kotlin') => transform(src, { target })

describe('a whole-valued Double converts into an integer struct field', () => {
  it('Swift: Date.now() in integer ms, Math.floor/round/trunc through pyreonInt(…), at init AND spread override', () => {
    const { code, warnings } = emit(whole, 'swift')
    expect(code).toContain('struct Todo: Codable {\n  var id: Int')
    expect(code).toContain('Todo(id: Int(Date().timeIntervalSince1970 * 1000), title: title)')
    expect(code).toContain(
      'Todo(id: pyreonInt(floor(Double(Double.random(in: 0..<1) * Double(1000)))), title: title)',
    )
    expect(code).toMatch(/Todo\(id: pyreonInt\(pyreonRound\(Double\(.*\)\) \+ Double\(1\)\), title: title\)/)
    expect(code).toContain('c.id = pyreonInt(trunc(Double(Double(x.id) / Double(2))))')
    // `Int(_:)` traps on NaN / ±Infinity; only the always-finite `Date.now()` keeps it.
    expect(code.match(/\bInt\(/g)).toHaveLength(2)
    expect(code).toContain('c.id = Int(Date().timeIntervalSince1970 * 1000)')
    // An integer value is untouched.
    expect(code).toContain('Todo(id: todos.count + 1, title: title)')
    expect(warnings).toEqual([])
  })

  it('Kotlin: Date.now() is System.currentTimeMillis(), Math.* wrapped in .toLong(), at init AND .copy(…)', () => {
    const { code, warnings } = emit(whole, 'kotlin')
    expect(code).toContain('data class Todo(var id: Long, var title: String)')
    expect(code).toContain('Todo(id = System.currentTimeMillis(), title = title)')
    expect(code).toContain('Todo(id = (Math.floor(Math.random() * 1000L)).toLong(), title = title)')
    expect(code).toMatch(/Todo\(id = \(pyreonRound\(.*\+ 1L\)\.toLong\(\), title = title\)/)
    expect(code).toContain('x.copy(id = (kotlin.math.truncate(')
    expect(code).toContain('x.copy(id = System.currentTimeMillis())')
    expect(code).not.toContain('System.currentTimeMillis().toDouble(), title')
    expect(warnings).toEqual([])
  })

  it.runIf(isSwiftcAvailable())(
    'swiftc type-checks the Swift (stubs)',
    () => {
      const r = validateSwiftWithStubs(emit(whole, 'swift').code)
      expect(r.ok, r.ok ? '' : r.error).toBe(true)
    },
    180_000,
  )

  it.runIf(isSwiftUIAvailable())(
    'swiftc type-checks the Swift (real SDK)',
    () => {
      const r = validateSwiftTypecheck(emit(whole, 'swift').code)
      expect(r.ok, r.ok ? '' : r.error).toBe(true)
    },
    180_000,
  )

  it.runIf(isKotlincAvailable())(
    'kotlinc compiles the Kotlin',
    () => {
      const r = validateKotlin(emit(whole, 'kotlin').code)
      expect(r.ok, r.ok ? '' : r.error).toBe(true)
    },
    180_000,
  )
})

describe('a fractional Double into an integer struct field is named, not truncated', () => {
  const fractional = `${head}
function App() {
  const todos = signal<Todo[]>([])
  const add = (title: string) => todos.update((t) => [...t, { id: Math.random(), title }])
  const half = () => todos.update((t) => t.map((x) => ({ ...x, id: x.id / 2 })))
  return (<Stack><Text>{todos().length}</Text><Button onPress={() => { add('a'); half() }}>add</Button></Stack>)
}`

  for (const [target, native] of [
    ['swift', 'Int'],
    ['kotlin', 'Long'],
  ] as const) {
    it(`${target}: one warning naming the field and the Double fix; the value is not converted`, () => {
      const { code, warnings } = emit(fractional, target)
      const named = warnings.filter((w) => w.includes('`Todo.id` is `number`'))
      expect(named).toHaveLength(1)
      expect(named[0]).toContain(`\`${native}\``)
      expect(named[0]).toContain('`id: Double`')
      expect(code).not.toMatch(/Int\(Double\.random|\.random\(\)\)\.toLong\(\)/)
    })
  }

  it('a field already Double is untouched', () => {
    const src = `import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
type Double = number
type Ev = { at: Double; n: number }
function App() {
  const evs = signal<Ev[]>([])
  const add = () => evs.update((e) => [...e, { at: Date.now(), n: e.length }])
  return (<Stack><Text>{evs().length}</Text><Button onPress={add}>add</Button></Stack>)
}`
    expect(emit(src, 'swift').code).toContain(
      'Ev(at: (Date().timeIntervalSince1970 * 1000), n: evs.count)',
    )
    expect(emit(src, 'kotlin').code).toContain(
      'Ev(at = System.currentTimeMillis().toDouble(), n = ',
    )
    expect(emit(src, 'swift').warnings).toEqual([])
    expect(emit(src, 'kotlin').warnings).toEqual([])
  })
})

// The same evidence the signal-seed refinement already reads, on an ANNOTATED local: `const row: Row = { value: 1.5 }`
// left `value` an `Int` / `Long` beside a `1.5` argument, uncompilable on both targets and (until the warning above)
// silent.
describe('an annotated local with a fractional literal makes the field Double', () => {
  const src = `import { Text } from '@pyreon/primitives'
interface Row { label: string; value: number }
export function C() {
  const row: Row = { label: 'a', value: 1.5 }
  return <Text>{row.label}</Text>
}`

  it('both targets declare the field Double, with no warning', () => {
    const sw = emit(src, 'swift')
    const kt = emit(src, 'kotlin')
    expect(sw.code).toContain('var value: Double')
    expect(kt.code).toContain('data class Row(var label: String, var value: Double)')
    expect(sw.warnings).toEqual([])
    expect(kt.warnings).toEqual([])
  })

  it.runIf(isSwiftcAvailable())(
    'swiftc type-checks the Swift (stubs)',
    () => {
      const r = validateSwiftWithStubs(emit(src, 'swift').code)
      expect(r.ok, r.ok ? '' : r.error).toBe(true)
    },
    180_000,
  )

  it.runIf(isKotlincAvailable())(
    'kotlinc compiles the Kotlin',
    () => {
      const r = validateKotlin(emit(src, 'kotlin').code)
      expect(r.ok, r.ok ? '' : r.error).toBe(true)
    },
    180_000,
  )
})

// ── Non-finite values: executed, not just compiled ──────────────────────────────────────────────────────────────
//
// `x / d` with `d = 0` is NaN (0/0) or ±Infinity, so each rounding function reaches the integer store with a
// non-finite Double. Before `pyreonInt`, the Swift binary died on the first NaN case ("Fatal error: Double value
// cannot be converted to Int because it is either infinite or NaN"); Kotlin printed 0 / Long.MAX_VALUE /
// Long.MIN_VALUE. Both must now print the same, and the finite cases must still match JavaScript.

const nonFinite = `import { Stack, Text } from '@pyreon/primitives'
type Todo = { id: number; title: string }
function floorOf(x: number, d: number): Todo { return { id: Math.floor(x / d), title: 'floor' } }
function ceilOf(x: number, d: number): Todo { return { id: Math.ceil(x / d), title: 'ceil' } }
function truncOf(x: number, d: number): Todo { return { id: Math.trunc(x / d), title: 'trunc' } }
function roundOf(x: number, d: number): Todo { return { id: Math.round(x / d), title: 'round' } }
function twiceOf(x: number, d: number): Todo { return { id: Math.floor(x / d) * 2, title: 'twice' } }
function roundPlusOf(x: number, d: number): Todo { return { id: Math.round(x / d) + 1, title: 'roundPlus' } }
function App() {
  return (<Stack><Text>{floorOf(1, 2).title}{ceilOf(1, 2).title}{truncOf(1, 2).title}{roundOf(1, 2).title}{twiceOf(1, 2).title}{roundPlusOf(1, 2).title}</Text></Stack>)
}`

const FNS = ['floorOf', 'ceilOf', 'truncOf', 'roundOf', 'twiceOf', 'roundPlusOf'] as const
const MAX = '9223372036854775807'
const MIN = '-9223372036854775808'
// [x, d, floor, ceil, trunc, round, floor * 2, round + 1] — the finite rows are JavaScript's own answers. A non-finite
// value reaches the store as NaN (→ 0) or ±Infinity (→ the saturated bound) on BOTH targets even through arithmetic:
// `Math.round(0 / 0) + 1` stored 1 on Android, because `java.lang.Math.round` had already turned NaN into 0 (#4258).
const CASES: readonly (readonly [number, number, string, string, string, string, string, string])[] = [
  [7, 2, '3', '4', '3', '4', '6', '5'],
  [-7, 2, '-4', '-3', '-3', '-3', '-8', '-2'],
  [-5, 2, '-3', '-2', '-2', '-2', '-6', '-1'],
  [0, 0, '0', '0', '0', '0', '0', '0'],
  [1, 0, MAX, MAX, MAX, MAX, MAX, MAX],
  [-1, 0, MIN, MIN, MIN, MIN, MIN, MIN],
]
const expected = CASES.flatMap(([x, d, ...want]) => FNS.map((f, i) => `${f} ${x} ${d} ${want[i]}`))

const RUNTIME = join(__dirname, '../../../runtime-swift/Sources/PyreonRuntime/PyreonNumber.swift')
const KOTLIN_RUNTIME = join(__dirname, '../../../runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonNumber.kt')
const javaOk = (() => {
  try {
    execFileSync('java', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

describe('a non-finite whole-valued Double is stored the same on both targets and never traps', () => {
  it('both targets declare the store without a trapping conversion and without a warning', () => {
    const sw = emit(nonFinite, 'swift')
    const kt = emit(nonFinite, 'kotlin')
    expect(sw.code).toContain('Todo(id: pyreonInt(floor(')
    expect(sw.code).not.toMatch(/\bInt\(/)
    expect(kt.code).toContain('Todo(id = (Math.floor(')
    expect(sw.warnings).toEqual([])
    expect(kt.warnings).toEqual([])
  })

  it.runIf(isSwiftcAvailable())(
    'Swift: executed against the real runtime helper',
    () => {
      const code = emit(nonFinite, 'swift').code
      const struct = code.match(/^struct Todo: Codable \{[\s\S]*?\n\}/m)![0]
      const fns = code.split('\n').filter((l) => /^func \w+Of\(/.test(l))
      expect(fns).toHaveLength(FNS.length)
      const main = CASES.flatMap(([x, d]) => FNS.map((f) => `print("${f} ${x} ${d} \\(${f}(${x}, ${d}).id)")`))
      const dir = mkdtempSync(join(tmpdir(), 'pyreon-int-field-'))
      writeFileSync(join(dir, 'main.swift'), [readFileSync(RUNTIME, 'utf8'), struct, ...fns, ...main].join('\n'))
      execFileSync('swiftc', [join(dir, 'main.swift'), '-o', join(dir, 'run')], { stdio: 'pipe' })
      expect(execFileSync(join(dir, 'run'), { encoding: 'utf8' }).trim().split('\n')).toEqual(expected)
    },
    180_000,
  )

  it.runIf(isKotlincAvailable() && javaOk)(
    'Kotlin: executed',
    () => {
      const code = emit(nonFinite, 'kotlin').code
      const struct = code.split('\n').find((l) => l.startsWith('data class Todo('))!
      const fns = code.split('\n').filter((l) => /^fun \w+Of\(/.test(l))
      expect(fns).toHaveLength(FNS.length)
      const main = [
        'fun main() {',
        ...CASES.flatMap(([x, d]) => FNS.map((f) => `  println("${f} ${x} ${d} \${${f}(${x}L, ${d}L).id}")`)),
        '}',
      ]
      const dir = mkdtempSync(join(tmpdir(), 'pyreon-int-field-'))
      writeFileSync(join(dir, 'main.kt'), ['import com.pyreon.runtime.*', struct, ...fns, ...main].join('\n'))
      execFileSync('kotlinc', [join(dir, 'main.kt'), KOTLIN_RUNTIME, '-include-runtime', '-d', join(dir, 'p.jar')], {
        stdio: 'pipe',
      })
      expect(execFileSync('java', ['-jar', join(dir, 'p.jar')], { encoding: 'utf8' }).trim().split('\n')).toEqual(
        expected,
      )
    },
    240_000,
  )
})

// `Math.round` itself, outside an integer store: both targets call the runtime's `pyreonRound`, which is JavaScript's
// rule. Each row is [input, JavaScript's `Math.round(input)`]; the executed programs print whether they agree (NaN is
// compared with NaN), so the Swift and Kotlin spellings of a Double never have to match each other's text.
const ROUND_ROWS: readonly (readonly [string, string])[] = [
  ['2.5', '3.0'],
  ['-2.5', '-2.0'],
  ['-0.5', '-0.0'],
  ['0.49999999999999994', '0.0'],
  ['4503599627370497.0', '4503599627370497.0'],
  ['1e300', '1e300'],
  ['-1e300', '-1e300'],
  ['Double.NaN', 'Double.NaN'],
  ['Double.POSITIVE_INFINITY', 'Double.POSITIVE_INFINITY'],
]
const roundOnly = `import { Stack, Text } from '@pyreon/primitives'
function roundOnly(x: number): number { return Math.round(x * 1.5) }
function App() { return (<Stack><Text>{roundOnly(1)}</Text></Stack>) }`

describe("Math.round is JavaScript's on both targets, NaN and ±Infinity included (#4258)", () => {
  it('both targets lower it to the runtime pyreonRound', () => {
    expect(emit(roundOnly, 'swift').code).toContain('pyreonRound(')
    expect(emit(roundOnly, 'kotlin').code).toContain('pyreonRound(')
    expect(emit(roundOnly, 'kotlin').code).not.toContain('Math.round(')
  })

  const swiftLit = (v: string) =>
    v.replace('Double.NaN', 'Double.nan').replace('Double.POSITIVE_INFINITY', 'Double.infinity')
  it.runIf(isSwiftcAvailable())(
    'Swift: executed',
    () => {
      const lines = ROUND_ROWS.map(
        ([x, want]) =>
          `do { let g = pyreonRound(${swiftLit(x)}); let w: Double = ${swiftLit(want)}; print(g.isNaN ? w.isNaN : (g == w && g.sign == w.sign)) }`,
      )
      const dir = mkdtempSync(join(tmpdir(), 'pyreon-round-'))
      writeFileSync(join(dir, 'main.swift'), [readFileSync(RUNTIME, 'utf8'), ...lines].join('\n'))
      execFileSync('swiftc', [join(dir, 'main.swift'), '-o', join(dir, 'run')], { stdio: 'pipe' })
      expect(execFileSync(join(dir, 'run'), { encoding: 'utf8' }).trim().split('\n')).toEqual(ROUND_ROWS.map(() => 'true'))
    },
    180_000,
  )

  it.runIf(isKotlincAvailable() && javaOk)(
    'Kotlin: executed',
    () => {
      const lines = ROUND_ROWS.map(
        ([x, want]) =>
          `  run { val g = pyreonRound(${x}); val w: Double = ${want}; println(if (g.isNaN()) w.isNaN() else g == w && (1.0 / g) == (1.0 / w)) }`,
      )
      const dir = mkdtempSync(join(tmpdir(), 'pyreon-round-'))
      writeFileSync(join(dir, 'main.kt'), ['import com.pyreon.runtime.*', 'fun main() {', ...lines, '}'].join('\n'))
      execFileSync('kotlinc', [join(dir, 'main.kt'), KOTLIN_RUNTIME, '-include-runtime', '-d', join(dir, 'p.jar')], {
        stdio: 'pipe',
      })
      expect(execFileSync('java', ['-jar', join(dir, 'p.jar')], { encoding: 'utf8' }).trim().split('\n')).toEqual(
        ROUND_ROWS.map(() => 'true'),
      )
    },
    240_000,
  )
})
