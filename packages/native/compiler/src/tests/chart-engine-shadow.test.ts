// A user type whose NAME matches one the generated chart engine declares
// SHADOWS it. The emit builds engine structs by BARE name, so the constructor
// resolves to the user's type and the native build fails — as an outright
// `invalid redeclaration` in the single-file compile gates, as a type mismatch
// at every engine call in a real two-module app.
//
// It shipped silently once: an example page's `interface Slice` against the
// pie datum's `Slice`. Nothing warned; only `native-examples-compile.test.ts`
// caught it, and that gate covers this repo's examples and nobody else's.

import { describe, expect, it } from 'vitest'
import { CHART_ENGINE_DECLARED_NAMES, CHART_ENGINE_STRUCTS } from '../chart-engine-structs'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const COLLIDES = `import { PieChart } from '@pyreon/charts/plot'
interface Slice { value: number; label: string }
const ROWS: Slice[] = [{ value: 1, label: 'a' }, { value: 2, label: 'b' }]
export function Board() {
  return <PieChart data={ROWS} value={(d) => d.value} label={(d) => d.label} height={200} />
}
`
// The same file with the type renamed — the fix the warning asks for.
const CLEAN = COLLIDES.replace(/\bSlice\b/g, 'Wedge')
// A colliding NAME with no chart import: nothing merges the engine's types in,
// so there is nothing to shadow and the warning must stay quiet.
const NO_CHART = `import { Stack, Text } from '@pyreon/primitives'
interface Slice { value: number; label: string }
const ROWS: Slice[] = [{ value: 1, label: 'a' }]
export function Board() {
  return (
    <Stack>
      <Text>{String(ROWS.length)}</Text>
    </Stack>
  )
}
`

const shadowWarnings = (src: string, target: 'swift' | 'kotlin'): string[] =>
  transform(src, { target }).warnings.filter((w) => w.includes('generated chart engine'))

describe('a user type that shadows a generated chart-engine type warns by name', () => {
  it('names the type, the mechanism and the fix, on both targets', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const found = shadowWarnings(COLLIDES, target)
      expect(found).toHaveLength(1)
      expect(found[0]).toContain('`Slice`')
      expect(found[0]).toContain('SHADOWS')
      expect(found[0]).toContain('Rename yours')
    }
  })

  it('stays quiet once the type is renamed, and for a file with no chart import at all', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      expect(shadowWarnings(CLEAN, target)).toEqual([])
      expect(shadowWarnings(NO_CHART, target)).toEqual([])
    }
  })

  // The warning is only worth anything if the failure it predicts is real —
  // and a compile that FAILS is the assertion, so the renamed twin has to pass
  // in the same breath or the fixture proves nothing about the collision.
  it.skipIf(!isSwiftcAvailable())('swiftc rejects the shadowed emit by that name and accepts the renamed one', () => {
    const bad = validateSwiftWithStubs(transform(COLLIDES, { target: 'swift' }).code)
    expect(bad.ok).toBe(false)
    expect(bad.error ?? '').toContain("invalid redeclaration of 'Slice'")
    const good = validateSwiftWithStubs(transform(CLEAN, { target: 'swift' }).code)
    expect(good.ok, good.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('kotlinc rejects the shadowed emit and accepts the renamed one', () => {
    expect(validateKotlin(transform(COLLIDES, { target: 'kotlin' }).code).ok).toBe(false)
    const good = validateKotlin(transform(CLEAN, { target: 'kotlin' }).code)
    expect(good.ok, good.error ?? '').toBe(true)
  })

  // The registry is generated beside the struct list from the SAME parse, so
  // a struct added to the engine cannot arrive without its shadow entry.
  it('the declared-name registry is TOTAL over the engine struct list', () => {
    const names = new Set(CHART_ENGINE_DECLARED_NAMES)
    const missing = CHART_ENGINE_STRUCTS.map((s) => s.name).filter((n) => !names.has(n))
    expect(missing).toEqual([])
    expect(CHART_ENGINE_DECLARED_NAMES.length).toBeGreaterThanOrEqual(CHART_ENGINE_STRUCTS.length)
  })

  // Engine FUNCTIONS and module CONSTANTS are deliberately absent: a function
  // can overload (so a shared name is fatal only when the signature matches),
  // and the constants are emitted `private`, so neither is fatal in a real
  // two-module app build. Warning there would tell a user to rename code that
  // works.
  it('leaves engine function and private-constant names out of the registry', () => {
    for (const n of ['plain', 'compact', 'renderChart', 'layoutChart', 'defaultTheme', 'HEAT_RAMP', 'DEFAULT_PALETTE']) {
      expect(CHART_ENGINE_DECLARED_NAMES).not.toContain(n)
    }
  })
})
