// A COLUMN mark (`line(prices)` — an array instead of an accessor) is a web
// path. The native lowering reads a mark's channel as an inline arrow, so a
// column must DECLINE with a warning that names the remedy, never compile to
// a chart that silently draws nothing on one target.
import { describe, expect, it } from 'vitest'
import { transform } from './charts-plugin'

const src = (attrs: string) => `import { Stack } from '@pyreon/primitives'
import { PlotChart, line } from '@pyreon/charts'
interface Row { v: number }
const ROWS: Row[] = [{ v: 1 }]
const PRICES = [1, 2, 3]
export function C() { return <Stack><PlotChart ${attrs} height={200} /></Stack> }`

describe('<PlotChart> column mark on native', () => {
  it.each(['swift', 'kotlin'] as const)('%s: a column mark declines and names the column', (target) => {
    const r = transform(src('data={ROWS} marks={[line(PRICES)]}'), { target })
    const text = r.warnings.join('\n')
    expect(text).toContain('mark 1')
    expect(text).toContain('column (an array of values) is web-only')
  })

  it.each(['swift', 'kotlin'] as const)('%s: a column-only chart with no data names the column case', (target) => {
    const r = transform(src('marks={[line(PRICES)]}'), { target })
    expect(r.warnings.join('\n')).toContain('column-only chart')
  })

  it.each(['swift', 'kotlin'] as const)('%s: arrow marks with no data are a plain omission, not a column chart', (target) => {
    const r = transform(src('marks={[line((d: Row) => d.v)]}'), { target })
    const text = r.warnings.join('\n')
    expect(text).toContain('needs `data` and `marks`')
    expect(text).not.toContain('column')
  })

  it.each(['swift', 'kotlin'] as const)('%s: a non-array accessor decline does NOT claim a column', (target) => {
    const r = transform(src('data={ROWS} marks={[line(mk())]}').replace('const PRICES', 'const mk = () => (d: Row) => d.v\nconst PRICES'), { target })
    const text = r.warnings.join('\n')
    expect(text).toContain('only a single-expression arrow')
    expect(text).not.toContain('column')
  })

  it.each(['swift', 'kotlin'] as const)('%s: density is a web-only prop and says so', (target) => {
    const r = transform(src('data={ROWS} marks={[line((d: Row) => d.v)]} density="device"'), { target })
    expect(r.warnings.join('\n')).toContain('density')
  })
})
