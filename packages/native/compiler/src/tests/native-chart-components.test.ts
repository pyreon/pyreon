// `<PieChart>` / `<GaugeChart>` (@pyreon/charts/plot) lower to the runtime
// PyreonPieChart / PyreonGaugeChart views over the GENERATED engine — the
// first JSX-level crossing of the chart initiative. Locks:
//
//   1. Emit shapes on BOTH targets — accessor props pass through as
//      closures (the wrapper is generic over the row type), scalar props
//      map 1:1, `data-testid` + a11y ride the special-emitter tail (the
//      Link/Toggle dropped-testid class).
//   2. Compile proofs via the mirror stubs (Linux-safe) — the stub inits
//      mirror PyreonChartCanvas.swift/.kt EXACTLY, and
//      emitted-runtime-types-exist pairs stub ↔ runtime by language.
//   3. The decline paths: an (d, index) accessor warns + falls back to
//      generic emit (the single-arg wrapper cannot carry it); a missing
//      required prop warns; `showLegend` / `onSelect` warn DROPPED.
//   4. The symbol table: importing `PlotChart` warns with the per-package
//      advice; PieChart/GaugeChart import warn-free.
//
// Bisect-load-bearing: revert the dispatch entries → the emit-shape specs
// fail with the literal tag (`PieChart(`) in output; revert the stub →
// the compile proofs fail unresolved.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const APP = `
import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
import { PieChart, GaugeChart } from '@pyreon/charts/plot'
type Tx = { id: number; description: string; amount: number }
export function App() {
  const txns = signal<Tx[]>([{ id: 1, description: "rent", amount: 1200 }])
  return (
    <Stack gap={2}>
      <PieChart data={txns} value={(t) => t.amount} label={(t) => t.description} height={200} data-testid="spend-pie" />
      <GaugeChart value={64} max={100} data-testid="save-gauge" />
    </Stack>
  )
}`

describe('radial chart components lower natively', () => {
  it('Swift: PieChart emits the runtime view with closure accessors + testid tail', () => {
    const r = transform(APP, { target: 'swift' })
    expect(r.warnings).toHaveLength(0)
    expect(r.code).toContain('PyreonPieChart(data: txns, value: { t in t.amount }, label: { t in t.description }, height: 200')
    expect(r.code).toContain('.accessibilityIdentifier("spend-pie")')
    expect(r.code).toContain('PyreonGaugeChart(value: 64')
    expect(r.code).toContain('.accessibilityIdentifier("save-gauge")')
    expect(r.code).not.toMatch(/\bPieChart\(/)
  })

  it('Kotlin: PieChart emits the runtime composable with testTag modifier', () => {
    const r = transform(APP, { target: 'kotlin' })
    expect(r.warnings).toHaveLength(0)
    expect(r.code).toContain('PyreonPieChart(data = txns')
    expect(r.code).toContain('value = { t -> t.amount }, label = { t -> t.description }, height = 200.0')
    expect(r.code).toContain('modifier = Modifier.testTag("spend-pie")')
    expect(r.code).toContain('PyreonGaugeChart(value = 64')
    expect(r.code).toContain('Modifier.testTag("save-gauge")')
  })

  it('an (d, index) accessor warns and falls back to generic emit', () => {
    const SRC = APP.replace('value={(t) => t.amount}', 'value={(t, i) => t.amount + i}')
    const r = transform(SRC, { target: 'swift' })
    expect(r.warnings.some((w) => String(w).includes('(d, index)'))).toBe(true)
    expect(r.code).not.toContain('PyreonPieChart(')
  })

  it('a missing required prop warns and falls back', () => {
    const SRC = APP.replace(' value={(t) => t.amount}', '')
    const r = transform(SRC, { target: 'swift' })
    expect(r.warnings.some((w) => String(w).includes('needs `data`, `value` and `label`'))).toBe(true)
  })

  it('web-only pie props warn DROPPED by name', () => {
    const SRC = APP.replace('height={200}', 'height={200} showLegend={true}')
    const r = transform(SRC, { target: 'swift' })
    expect(r.warnings.some((w) => String(w).includes('`showLegend`'))).toBe(true)
  })

  it('importing PlotChart warns with the per-package advice; the radials do not', () => {
    const SRC = `import { PlotChart } from '@pyreon/charts/plot'\nimport { Text } from '@pyreon/primitives'\nexport function P() { return <Text>x</Text> }`
    const r = transform(SRC, { target: 'swift' })
    expect(r.warnings.some((w) => String(w).includes('PieChart') && String(w).includes('web-only'))).toBe(true)
    const clean = transform(APP, { target: 'swift' })
    expect(clean.warnings).toHaveLength(0)
  })

  it.skipIf(!isSwiftUIAvailable())('iOS: the emitted app typechecks against the mirror stubs', () => {
    const r = validateSwiftWithStubs(transform(APP, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Android: the emitted app compiles via kotlinc', () => {
    const r = validateKotlin(transform(APP, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
