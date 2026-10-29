// A style decision tree — a NESTED ternary whose every leaf is an object literal — lowers to one nested conditional
// value per property, on both targets.
//
// Before, the dynamic style path took exactly one `cond ? {A} : {B}`: a nested inline ternary was DROPPED with a
// warning, and a rocketstyle component with two dynamic dimensions (`state` AND `size` driven by signals — an
// ordinary button) warned and froze every dimension at its first branch, so it never reacted on iOS or Android.
// Rocketstyle now resolves the dimension PRODUCT to a nested ternary, and the connector folds it.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const BTN = `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
const Btn = rocketstyle()({ name: 'Btn', component: Stack })
  .theme(() => ({ padding: '12px' }))
  .states({ primary: { backgroundColor: '#2563eb' }, danger: { backgroundColor: '#dc2626' } })
  .sizes({ small: { padding: '8px' }, large: { padding: '16px' } })
export function App() {
  const hot = signal(false)
  const big = signal(false)
  return <Btn state={hot() ? 'danger' : 'primary'} size={big() ? 'large' : 'small'}><Text>x</Text></Btn>
}`

const INLINE = `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  const a = signal(false)
  const b = signal(false)
  return (
    <Stack style={a() ? (b() ? { padding: 4, opacity: 0.2 } : { padding: 8, opacity: 0.4 }) : { padding: 12, opacity: 1 }}>
      <Text style={a() ? (b() ? { color: '#ff0000' } : { color: '#00ff00' }) : { color: '#0000ff' }}>x</Text>
    </Stack>
  )
}`

describe('style decision tree', () => {
  it('rocketstyle with two independent dynamic dims: each property follows ITS dimension', () => {
    const swift = transform(BTN, { target: 'swift' })
    expect(swift.warnings).toEqual([])
    // padding is set by SIZE (inner level) at every leaf, so the outer `hot` level carries the same pair twice.
    expect(swift.code).toContain('.padding(((hot) ? ((big) ? 16 : 8) : ((big) ? 16 : 8)))')
    const kotlin = transform(BTN, { target: 'kotlin' })
    expect(kotlin.warnings).toEqual([])
    expect(kotlin.code).toContain('.padding((if (hot) (if (big) 16 else 8) else (if (big) 16 else 8)).dp)')
  })

  it('an inline nested style ternary lowers instead of being dropped', () => {
    const swift = transform(INLINE, { target: 'swift' })
    expect(swift.warnings).toEqual([])
    expect(swift.code).toContain('.padding(((a) ? ((b) ? 4 : 8) : 12))')
    expect(swift.code).toContain('.opacity(((a) ? ((b) ? 0.2 : 0.4) : 1))')
  })

  it('a nested Text colour lowers to a nested Compose color argument', () => {
    const kotlin = transform(INLINE, { target: 'kotlin' })
    expect(kotlin.warnings).toEqual([])
    expect(kotlin.code).toMatch(/color = if \(a\) \(if \(b\) Color\(0xFFFF0000\) else Color\(0xFF00FF00\)\) else Color\(0xFF0000FF\)/)
  })

  it('a property on only SOME leaves is still warned, not silently dropped', () => {
    const src = INLINE.replace('{ padding: 12, opacity: 1 }', '{ padding: 12 }')
    const r = transform(src, { target: 'swift' })
    expect(r.warnings.join('\n')).toMatch(/\[opacity\] differ in shape or exist in only one branch/)
  })

  for (const [name, src] of [['rocketstyle product', BTN], ['inline nested ternary', INLINE]] as const) {
    it.runIf(isSwiftcAvailable())(`${name}: Swift emit typechecks`, () => {
      const v = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
      expect(v.ok, v.error).toBe(true)
    })
    it.runIf(isKotlincAvailable())(`${name}: Kotlin emit compiles`, () => {
      const v = validateKotlin(transform(src, { target: 'kotlin' }).code)
      expect(v.ok, v.error).toBe(true)
    }, 120_000)
  }
})
