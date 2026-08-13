// `useToggle` and `useCounter` are pure state containers — a signal plus a
// few mutators, with no platform dependency at all. They needed no native
// runtime; what they needed was a LOWERING, and without one the call emitted
// verbatim and failed the build with `cannot find 'useToggle' in scope`.
//
// That is the shape of most of the unlowered hook surface: of 56 web hooks,
// 22 lowered, and a dozen of the remainder are logic a target already has.
//
// The mutators rewrite at their USE SITES rather than through a runtime
// wrapper, so `useCounter`'s clamp is visible in the emitted arithmetic and
// is written once (`clampExpr`) for both targets — a counter that clamped
// differently per platform is exactly the divergence a shared helper
// prevents.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const APP = `import { useToggle, useCounter } from '@pyreon/hooks'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App() {
  const open = useToggle(false)
  const qty = useCounter(1, { min: 0, max: 10 })
  return (
    <Stack>
      <Text>{open.value() ? 'open' : 'shut'}</Text>
      <Text>{qty.count()}</Text>
      <Button onPress={() => open.toggle()}>toggle</Button>
      <Button onPress={() => qty.inc()}>+</Button>
      <Button onPress={() => qty.dec(2)}>-2</Button>
      <Button onPress={() => qty.reset()}>reset</Button>
    </Stack>
  )
}`

describe('the state becomes a plain field', () => {
  it('Swift', () => {
    const out = transform(APP, { target: 'swift' }).code
    expect(out).toContain('@State private var `open`: Bool = false')
    expect(out).toContain('@State private var qty: Int = 1')
  })

  it('Kotlin', () => {
    const out = transform(APP, { target: 'kotlin' }).code
    expect(out).toContain('var open by remember { mutableStateOf(false) }')
    expect(out).toContain('var qty by remember { mutableStateOf(1) }')
  })

  it('lowering is silent AND the verbatim call is gone', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(APP, { target })
      expect(r.warnings).toEqual([])
      expect(r.code).not.toContain('useToggle(')
      expect(r.code).not.toContain('useCounter(')
    }
  })
})

describe('reads drop their parens; mutators become the arithmetic', () => {
  it('Swift', () => {
    const out = transform(APP, { target: 'swift' }).code
    expect(out).toContain('`open` ? "open" : "shut"')
    expect(out).toContain('`open`.toggle()')
    // The clamp is baked in, so the native counter cannot drift past the
    // bounds the web enforces.
    expect(out).toContain('qty = min(max(qty + 1, 0), 10)')
    expect(out).toContain('qty = min(max(qty - 2, 0), 10)')
    // reset() restores the INITIAL value, clamped exactly as the web does.
    expect(out).toContain('qty = min(max(1, 0), 10)')
  })

  it('Kotlin clamps identically', () => {
    const out = transform(APP, { target: 'kotlin' }).code
    expect(out).toContain('open = !open')
    expect(out).toContain('qty = minOf(maxOf(qty + 1, 0), 10)')
    expect(out).toContain('qty = minOf(maxOf(qty - 2, 0), 10)')
    expect(out).toContain('qty = minOf(maxOf(1, 0), 10)')
  })

  it('an unbounded counter emits no clamp at all', () => {
    const src = `import { useCounter } from '@pyreon/hooks'
import { Button } from '@pyreon/primitives'
export function App() {
  const n = useCounter(0)
  return <Button onPress={() => n.inc()}>{n.count()}</Button>
}`
    expect(transform(src, { target: 'swift' }).code).toContain('n = n + 1')
    expect(transform(src, { target: 'kotlin' }).code).toContain('n = n + 1')
  })
})

describe('a value that cannot be baked declines by name', () => {
  const decline = (body: string) =>
    transform(
      `import { useCounter, useToggle } from '@pyreon/hooks'
import { Text } from '@pyreon/primitives'
export function App() { ${body} return <Text>x</Text> }`,
      { target: 'swift' },
    ).warnings.join('\n')

  it('a non-literal initial value', () => {
    expect(decline('const n = useCounter(fromServer);')).toContain('numeric literal')
  })

  it('a non-literal bound — silently dropping it would stop the clamp', () => {
    expect(decline('const n = useCounter(0, { max: limit });')).toContain('clamp cannot be baked')
  })

  it('a non-literal toggle seed', () => {
    expect(decline('const t = useToggle(fromServer);')).toContain('boolean literal')
  })
})

describe('the emitted state survives the real toolchains', () => {
  it.skipIf(!isSwiftcAvailable())('Swift type-checks against the stub', () => {
    const r = validateSwiftWithStubs(transform(APP, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin compiles on kotlinc', () => {
    const r = validateKotlin(transform(APP, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
