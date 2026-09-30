// Two shared-source bugs found by PR #3759, both silent-on-web / broken-native.
//
// 1. `<Text>{a} {b}</Text>`: the single space between two expression containers
//    is content per the JSX rule (only whitespace containing a LINE BREAK is
//    layout), but the parser dropped every all-whitespace JSXText, so native
//    rendered "xy" where web renders "x y".
// 2. `d !== 0` with `d: Double`: JS compares Numbers; Kotlin has no Int/Double
//    `!=`, so the emitted `d != 0` failed kotlinc. Swift accepts the bare
//    literal, so the fix (and this test's failing half) is Kotlin's.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { cleanJsxText } from '../parse'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const app = (body: string, pre = '') => `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
function App() {
  const a = signal('x')
  const b = signal('y')
  const d = signal(1.5)
  const n = signal(2)
${pre}
  return (${body})
}`

const gen = (t: 'swift' | 'kotlin', src: string) => transform(src, { target: t }).code

describe('JSX whitespace follows the JSX rule', () => {
  it('cleanJsxText: inline space kept, line-break layout whitespace dropped', () => {
    expect(cleanJsxText(' ')).toBe(' ')
    expect(cleanJsxText('  ')).toBe('  ')
    expect(cleanJsxText('\n   ')).toBe('')
    expect(cleanJsxText(' \n  ')).toBe('')
    expect(cleanJsxText('\n  hello  \n  world\n')).toBe('hello world')
    expect(cleanJsxText(' hi ')).toBe(' hi ')
  })

  const body = '<Stack><Text>{a()} {b()}</Text></Stack>'
  it('Swift: {a} {b} keeps the space', () => {
    expect(gen('swift', app(body))).toContain('"\\(a) \\(b)"')
  })
  it('Kotlin: {a} {b} keeps the space', () => {
    expect(gen('kotlin', app(body))).toContain('"${a} ${b}"')
  })
  it('layout whitespace between elements is still dropped', () => {
    const multi = `<Stack>
      <Text>{a()}</Text>
      {' '}
      <Text>{b()}</Text>
    </Stack>`
    const s = gen('swift', app(multi))
    expect(s).not.toContain('Text(verbatim: "\\(a)")\n      Text(verbatim: " ")')
    const spaced = gen('swift', app('<Stack>\n<Text>{a()}</Text>\n<Text>{b()}</Text>\n</Stack>'))
    expect(spaced).not.toContain('" "')
  })
})

describe('integer literal beside a Double compares as a Double', () => {
  const pre = `  const z = d() !== 0
  const y = 0 === d()
  const w = d() > 1
  const m = n() !== 0`
  const body = '<Stack><Text>{z ? a() : b()}</Text></Stack>'
  it('Kotlin widens the literal, leaves Int compares alone', () => {
    const k = gen('kotlin', app(body, pre))
    expect(k).toContain('val z = d != 0.0')
    expect(k).toContain('val y = 0.0 == d')
    expect(k).toContain('val w = d > 1.0')
    expect(k).toContain('val m = n != 0')
    expect(k).not.toContain('n != 0.0')
  })
  it('Swift is unchanged (literal already coerces)', () => {
    const s = gen('swift', app(body, pre))
    expect(s).toContain('let z = d != 0')
    expect(s).not.toContain('0.0')
  })
})

describe('both survive the real toolchains', () => {
  const pre = `  const z = d() !== 0
  const y = 0 === d()`
  const body = '<Stack><Text>{a()} {b()}</Text><Text>{z ? a() : b()}</Text></Stack>'
  it.skipIf(!isSwiftcAvailable())('Swift type-checks', () => {
    const r = validateSwiftWithStubs(gen('swift', app(body, pre)))
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Kotlin compiles', () => {
    const r = validateKotlin(gen('kotlin', app(body, pre)))
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
