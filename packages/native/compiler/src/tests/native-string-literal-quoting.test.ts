// 2026-09 PMTC audit — string literals, identifiers, parseInt, number→string.
//
// One theme: the emitters HAD the right helpers and did not route through
// them. `JSON.stringify` was used as a Swift/Kotlin string quoter at ~240
// sites, and it is neither —
//
//   Kotlin  leaves `$` unescaped, Kotlin's interpolation marker: a string
//           `'due: $total now'` beside a signal `total` compiled and READ the
//           signal (iOS printed `due: $total now`, Android `due: 9 now`); with
//           no such binding it was `unresolved reference` instead. `\f`/`\b`
//           are not Kotlin escapes.
//   Swift   has no `\b`, `\f` or `\uXXXX` (it spells `\u{X}`), so a control
//           character in any string was a compile error. And the JSX-text
//           escaper re-matched its OWN output: `\(` → `\\(` → `\\\(`, which
//           Swift reads as an escaped backslash + a LIVE interpolation, so
//           literal text `\(count)` rendered the signal.
//
// Plus three identifier gaps (`'top-left' | …` unions emitted as enum cases
// verbatim; quoted object keys reaching struct fields and Kotlin named
// arguments unescaped), a dropped `parseInt` radix, and `'pct=' + 250.0`
// printing `pct=250.0` where JS prints `pct=250`. Every emit below is
// compiled by the REAL toolchains where available — the string-shape specs
// are the discriminators for the shapes that compile on one target and are
// silently wrong on the other.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { kotlinStr, swiftStr } from '../string-literals'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const SRC = `import { Stack, Text } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
type Mode = 'top-left' | 'bottom-right' | 'class'
function App() {
  const total = signal<number>(9)
  const label = signal<string>('due: $total now \\u0007 \\f \\b tab\\t \\u2028')
  const mode = signal<Mode>('top-left')
  const hex = signal<string>('ff')
  const n = computed(() => parseInt(hex(), 16))
  const a = signal<number>(10)
  const b = signal<number>(4)
  const pct = computed(() => 'pct=' + (a() / b() * 100))
  const o = signal({ 'my-key': 1, 'class': 4, plain: 'x' })
  return (<Stack><Text>Regex: \\(total) matched {total}</Text><Text>{label}</Text><Text>{n}</Text><Text>{pct}</Text><Text>{o().plain}</Text></Stack>)
}`

const code = (target: 'swift' | 'kotlin') => transform(SRC, { target, filename: 'App.tsx' }).code
const line = (target: 'swift' | 'kotlin', needle: string) =>
  code(target)
    .split('\n')
    .find((l) => l.includes(needle)) ?? ''

describe('the central string quoters', () => {
  it('Kotlin escapes `$` and spells controls as \\uXXXX', () => {
    expect(kotlinStr('due: $total \x0c')).toBe('"due: \\$total \\u000c"')
    expect(kotlinStr(5)).toBe('5')
  })
  it('Swift spells controls as \\u{X}, never \\b/\\f/\\uXXXX, and a literal `\\(` stays inert', () => {
    expect(swiftStr('a\x08\x0c\x07')).toBe('"a\\u{8}\\u{c}\\u{7}"')
    expect(swiftStr('\\(x)')).toBe('"\\\\(x)"')
    expect(swiftStr(true)).toBe('true')
  })
})

describe('string literals reach the emit through the quoters', () => {
  it('Kotlin: `$` in a string literal is escaped (was a live interpolation)', () => {
    expect(line('kotlin', 'var label')).toContain(
      '"due: \\$total now \\u0007 \\u000c \\b tab\\t \\u2028"',
    )
  })
  it('Swift: control characters are legal escapes', () => {
    expect(line('swift', 'var label')).toContain(
      '"due: $total now \\u{7} \\u{c} \\u{8} tab\\t \\u{2028}"',
    )
  })
  it('Swift: JSX text `\\(total)` is literal text, only `{total}` interpolates', () => {
    const l = line('swift', 'Regex')
    expect(l).toContain('Regex: \\\\(total) matched \\(total)')
    expect(l).not.toContain('\\\\\\(total)')
  })
})

describe('identifiers that are not identifiers', () => {
  it('Swift enum cases are camelCased with the original raw value; keyword cases backticked', () => {
    expect(code('swift')).toContain(
      'case topLeft = "top-left", bottomRight = "bottom-right", `class` = "class"',
    )
    expect(line('swift', 'var mode')).toContain('.topLeft')
  })
  it('Kotlin enum entries are backticked (serialized name unchanged)', () => {
    expect(code('kotlin')).toContain('enum class Mode { `top-left`, `bottom-right`, `class` }')
    expect(line('kotlin', 'var mode')).toContain('Mode.`top-left`')
  })
  it('Swift struct fields from quoted keys are renamed with CodingKeys keeping the JSON key', () => {
    const c = code('swift')
    expect(c).toContain('var myKey: Int')
    expect(c).toContain('case myKey = "my-key"')
    expect(c).toContain('AppO(myKey: 1, `class`: 4, plain: "x")')
  })
  it('Kotlin struct fields and named arguments are backticked on BOTH declaration paths', () => {
    const c = code('kotlin')
    expect(c).toContain('data class AppO(val `my-key`: Int, val `class`: Int, val plain: String)')
    expect(c).toContain('__Obj0(`my-key` = 1, `class` = 4, plain = "x")')
    expect(c).not.toMatch(/\bmy-key: Int/)
  })
})

describe('parseInt radix and JS-faithful Double → string', () => {
  it('honours the radix on both targets', () => {
    expect(line('swift', 'var n')).toContain('Int(hex, radix: 16) ?? 0')
    expect(line('kotlin', 'val n')).toContain('toIntOrNull(16) ?: 0')
  })
  it('a Double concat operand goes through pyreonNumString (`250`, not `250.0`)', () => {
    expect(line('swift', 'var pct')).toContain('"pct=" + pyreonNumString(')
    expect(line('kotlin', 'val pct')).toContain('"pct=" + pyreonNumString(')
  })
})

describe('the whole emit compiles', () => {
  it.skipIf(!isSwiftcAvailable())('swiftc', () => {
    const r = validateSwiftWithStubs(code('swift'))
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('kotlinc', () => {
    const r = validateKotlin(code('kotlin'))
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
