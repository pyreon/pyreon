// Cartesian basics on native: bar thickness and gaps lower as literals on the
// ChartSpec (the engine's own `layoutGroupedBars` etc. read them), and the
// web-only per-datum `fill` is NAMED, never silently different.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transform, validateKotlin } from './charts-plugin'
import { isKotlincAvailable, isSwiftUIAvailable, validateSwiftTypecheck } from '../validate'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../../../..')
const read = (p: string) => readFileSync(join(REPO, p), 'utf8')
const CANVAS_SWIFT = 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonChartCanvas.swift'
const ENGINE_SWIFT = 'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonChartEngine.swift'

const GROUPED = `import { Bar, Chart } from '@pyreon/charts'
import { Stack } from '@pyreon/primitives'
interface Row { m: string; a: number; b: number }
const ROWS: Row[] = [{ m: 'Jan', a: 3, b: 5 }, { m: 'Feb', a: 4, b: 1 }]
export function App() {
  return (
    <Stack>
      <Chart data={ROWS} x="m" height={200} barWidth={14} barGap={0.5} barCategoryGap={0.4}>
        <Bar y="a" group />
        <Bar y="b" group />
      </Chart>
      <Chart data={ROWS} x="m" height={160} horizontal barWidth={9}>
        <Bar y="a" />
      </Chart>
    </Stack>
  )
}
`

const FILL = `import { Bar, Chart, shadeBy } from '@pyreon/charts'
interface Row { m: string; a: number; t: number }
const ROWS: Row[] = [{ m: 'Jan', a: 3, t: 5 }, { m: 'Feb', a: 4, t: 1 }]
export function App() {
  return (
    <Chart<Row> data={ROWS} x="m" height={200}>
      <Bar<Row> y="a" fill={shadeBy<Row>('t')} />
    </Chart>
  )
}
`

describe.each(['swift', 'kotlin'] as const)('bar thickness on %s', (target) => {
  it('barWidth / barGap / barCategoryGap land on the ChartSpec as literals, in the struct\'s field order', () => {
    const r = transform(GROUPED, { target })
    expect(r.warnings).toEqual([])
    const sep = target === 'swift' ? ': ' : ' = '
    expect(r.code).toContain(`barWidth${sep}14.0`)
    expect(r.code).toContain(`barGap${sep}0.5`)
    expect(r.code).toContain(`barCategoryGap${sep}0.4`)
    expect(r.code).toContain(`barWidth${sep}9.0`)
    // Declared order: barWidth, barGap, barCategoryGap.
    expect(r.code.indexOf('barWidth')).toBeLessThan(r.code.indexOf('barGap'))
    expect(r.code.indexOf('barGap')).toBeLessThan(r.code.indexOf('barCategoryGap'))
  })
  it('a chart that sets none emits no bar-geometry argument at all (byte-stable)', () => {
    const r = transform(GROUPED.replace(' barWidth={14} barGap={0.5} barCategoryGap={0.4}', '').replace(' barWidth={9}', ''), { target })
    expect(r.code).not.toContain('barWidth')
    expect(r.code).not.toContain('barGap')
    expect(r.code).not.toContain('barCategoryGap')
  })
  it('a non-literal width is named and left off', () => {
    const r = transform(GROUPED.replace('barWidth={14}', 'barWidth={Math.min(ROWS.length, 14)}'), { target })
    expect(r.warnings.some((w) => w.includes('`barWidth` must be a number literal on native'))).toBe(true)
  })
})

describe.each(['swift', 'kotlin'] as const)('per-datum fill on %s is declined by name', (target) => {
  it('warns once per mark and the bars draw in the series colour', () => {
    const r = transform(FILL, { target })
    const named = r.warnings.filter((w) => w.includes('`fill` (per-datum colour'))
    expect(named).toHaveLength(1)
    expect(named[0]).toContain('series colour')
    expect(r.code).not.toContain('itemColors')
  })
})

const BRIDGE = `import { Chart, Line } from '@pyreon/charts'
interface Row { m: string; a: number }
const ROWS: Row[] = [{ m: 'Jan', a: 3 }, { m: 'Feb', a: 4 }]
export function App() {
  return (
    <Chart<Row> data={ROWS} x="m" height={200}>
      <Line<Row> y="a" connectNulls />
    </Chart>
  )
}
`

describe.each(['swift', 'kotlin'] as const)('connectNulls on %s', (target) => {
  it('lowers as a literal Series field and compiles', () => {
    const r = transform(BRIDGE, { target })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(target === 'swift' ? 'connectNulls: true' : 'connectNulls = true')
    if (target === 'swift' && isSwiftUIAvailable()) {
      const v = validateSwiftTypecheck(read(CANVAS_SWIFT) + '\n' + read(ENGINE_SWIFT) + '\n' + r.code)
      expect(v.ok, v.error ?? '').toBe(true)
    }
    if (target === 'kotlin' && isKotlincAvailable()) expect(validateKotlin(r.code)).toMatchObject({ ok: true })
  })
  it('an unset chart emits no connectNulls (byte-stable)', () => {
    expect(transform(BRIDGE.replace(' connectNulls', ''), { target }).code).not.toContain('connectNulls')
  })
})

describe('the emit compiles', () => {
  it.skipIf(!isSwiftUIAvailable())('swiftc against real SwiftUI + canvas + engine accepts the grouped / horizontal emit', () => {
    const r = validateSwiftTypecheck(read(CANVAS_SWIFT) + '\n' + read(ENGINE_SWIFT) + '\n' + transform(GROUPED, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('kotlinc accepts the grouped / horizontal emit', () => {
    const r = validateKotlin(transform(GROUPED, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
