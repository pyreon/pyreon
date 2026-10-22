// A view helper with a BLOCK body — `const Row = (x: number) => { const label = …; return <Text>{label}</Text> }` called
// as `{Row(1)}` — lowers like the expression-bodied one: `@ViewBuilder func Row(_ x: Int)` / `@Composable fun Row(x:
// Long)`.
//
// Before, only the expression body lowered. The block body emitted a closure (`private let Row = { x in … }`) that
// neither `swiftc` nor `kotlinc` accepts — Kotlin dropped the body outright — while every call site warned and rendered
// nothing. The body is planned with `planViewBlock`, the same planner block-bodied render callbacks use, so it takes the
// same shapes: `const` locals, early-return `if`s, a final view, `return null`.
import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const both = ['swift', 'kotlin'] as const

const MODULE = [
  "import { Text, Stack } from '@pyreon/primitives'",
  'const Row = (x: number) => {',
  "  const label = 'row ' + String(x)",
  '  if (x > 9) return <Text>many</Text>',
  '  return <Text>{label}</Text>',
  '}',
  'export function App() {',
  '  return <Stack>{Row(1)}{Row(2)}</Stack>',
  '}',
].join('\n')

const COMPONENT = [
  "import { Text, Stack } from '@pyreon/primitives'",
  'export function App() {',
  "  const prefix = 'item'",
  '  const renderRow = (n: number) => {',
  '    const label = prefix + String(n)',
  '    if (n === 0) return null',
  '    return <Text>{label}</Text>',
  '  }',
  '  return <Stack>{renderRow(0)}{renderRow(1)}</Stack>',
  '}',
].join('\n')

describe('a block-bodied view helper at file scope', () => {
  it.each(both)('lowers to a view function with its locals and early return (%s)', (target) => {
    const r = transform(MODULE, { target })
    expect(r.warnings).toEqual([])
    if (target === 'swift') {
      expect(r.code).toContain('@ViewBuilder private func Row(_ x: Int) -> some View {')
      expect(r.code).toContain('let label = "row " + String(x)')
      expect(r.code).toMatch(/if x > 9 \{\s+Text\("many"\)\s+\} else \{\s+Text\(verbatim: "\\\(label\)"\)/)
      expect(r.code).not.toMatch(/let Row = \{/)
    } else {
      expect(r.code).toContain('private fun Row(x: Long) {')
      expect(r.code).toContain('val label = "row " + (x).toString()')
      expect(r.code).not.toMatch(/val Row = \{/)
    }
    expect(r.code).toMatch(/Row\(1L?\)/)
  })

  it.skipIf(!isSwiftcAvailable())('the Swift emit typechecks', () => {
    const r = validateSwiftWithStubs(transform(MODULE, { target: 'swift' }).code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the Kotlin emit compiles', () => {
    const r = validateKotlin(transform(MODULE, { target: 'kotlin' }).code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  }, 180_000)
})

describe('a block-bodied view helper in a component', () => {
  it.each(both)('lowers, reading a value const and rendering nothing for `return null` (%s)', (target) => {
    const r = transform(COMPONENT, { target })
    expect(r.warnings).toEqual([])
    if (target === 'swift') {
      // A struct-level func cannot see `body`'s locals, so the value const is inlined, as the expression form does.
      expect(r.code).toContain('let label = ("item") + String(n)')
      expect(r.code).toMatch(/if n == 0 \{\s+EmptyView\(\)\s+\} else \{/)
    } else {
      expect(r.code).toMatch(/@Composable\s+(private )?fun renderRow\(n: Long\) \{/)
      // A local composable sees the component's `val`s directly, so nothing is inlined on Kotlin.
      expect(r.code).toContain('val label = prefix + (n).toString()')
    }
  })

  it.skipIf(!isSwiftcAvailable())('the Swift emit typechecks', () => {
    const r = validateSwiftWithStubs(transform(COMPONENT, { target: 'swift' }).code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the Kotlin emit compiles', () => {
    const r = validateKotlin(transform(COMPONENT, { target: 'kotlin' }).code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  }, 180_000)
})

describe('a block body with no view-builder shape is still named', () => {
  it.each(both)('a loop in the body keeps the call-site warning (%s)', (target) => {
    const src = [
      "import { Text, Stack } from '@pyreon/primitives'",
      'const Row = (x: number) => {',
      '  let total = 0',
      '  for (let i = 0; i < x; i++) total += i',
      '  return <Text>{String(total)}</Text>',
      '}',
      'export function App() { return <Stack>{Row(3)}</Stack> }',
    ].join('\n')
    const r = transform(src, { target })
    expect(r.warnings.some((w) => /calls a JSX-returning helper as a FUNCTION/.test(String(w)))).toBe(true)
  })
})
