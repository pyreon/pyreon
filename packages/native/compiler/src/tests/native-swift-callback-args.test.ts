// A callback passed to a user component's `on…` prop keeps its parameters on Swift.
//
// THE BUG: `<Pick onPick={(x) => v.set(x)} />` emitted `Pick(onPick: { v = x })` — the closure's parameter was
// dropped, so `swiftc` failed with "cannot find 'x' in scope", with no warning. The emit routed every `on…` prop
// through the closure builder for SwiftUI action slots, which take no arguments. Kotlin was always right
// (`{ x -> v = x }`). Passing a value up through a callback prop is how child-to-parent communication works.
import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const APP = [
  "import { Button, Stack, Text } from '@pyreon/primitives'",
  "import { signal } from '@pyreon/reactivity'",
  'function Pick(props: { onPick: (v: string) => void; onMove: (x: number, y: number) => void; onReset: () => void }) {',
  '  return (',
  '    <Stack>',
  "      <Button onPress={() => props.onPick('a')}>pick</Button>",
  '      <Button onPress={() => props.onMove(1, 2)}>move</Button>',
  '      <Button onPress={() => props.onReset()}>reset</Button>',
  '    </Stack>',
  '  )',
  '}',
  'export function App() {',
  "  const v = signal('')",
  '  const pos = signal(0)',
  '  return (',
  '    <Stack>',
  '      <Pick',
  '        onPick={(x) => v.set(x)}',
  '        onMove={(dx, dy) => {',
  '          const sum = dx + dy',
  '          pos.set(sum)',
  '        }}',
  "        onReset={() => v.set('')}",
  '      />',
  '      <Text>{v()}</Text>',
  '    </Stack>',
  '  )',
  '}',
].join('\n')

describe('Swift: a callback prop keeps its parameters', () => {
  const out = transform(APP, { target: 'swift' })

  it('binds one parameter, several parameters, and a block body', () => {
    expect(out.warnings).toEqual([])
    expect(out.code).toContain('onPick: { x in v = x }')
    expect(out.code).toMatch(/onMove: \{ dx, dy in\n\s+let sum = dx \+ dy\n\s+pos = sum\n\s+\}/)
  })

  it('leaves a zero-parameter callback unchanged', () => {
    expect(out.code).toContain('onReset: { v = "" }')
  })

  it.skipIf(!isSwiftcAvailable())('typechecks', () => {
    const r = validateSwiftWithStubs(out.code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  })
})

describe('Kotlin is unchanged', () => {
  it.skipIf(!isKotlincAvailable())('compiles', () => {
    const r = validateKotlin(transform(APP, { target: 'kotlin' }).code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  }, 180_000)
})
