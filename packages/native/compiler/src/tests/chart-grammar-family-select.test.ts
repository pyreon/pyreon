// `<Chart onSelect>` reports the drawn item's INDEX on every target. For a
// family mark that means the host's `onSelectIndex`: the host's own
// `onSelect` is shaped per family (a heatmap reports its cell), which native
// cannot build and warns about. The web grammar routes it the same way.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const grammar = `import { signal } from '@pyreon/reactivity'
import { Chart, Cell } from '@pyreon/charts'
interface Row { day: string; hour: string; load: number }
const ROWS: Row[] = [{ day: 'Mon', hour: '9', load: 3 }]
export function App() {
  const picked = signal(-1)
  return <Chart data={ROWS} height={200} onSelect={(i: number) => picked.set(i)}><Cell x="hour" y="day" value="load" /></Chart>
}
`
const explicit = `import { signal } from '@pyreon/reactivity'
import { HeatmapChart } from '@pyreon/charts/engine'
interface Row { day: string; hour: string; load: number }
const ROWS: Row[] = [{ day: 'Mon', hour: '9', load: 3 }]
export function App() {
  const picked = signal(-1)
  return <HeatmapChart data={ROWS} height={200} onSelectIndex={(i: number) => picked.set(i)} x={(d) => d.hour} y={(d) => d.day} value={(d) => d.load} />
}
`

describe('<Chart onSelect> over a family mark', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: lowers to the host's index callback, with no warning`, () => {
      const r = transform(grammar, { target })
      expect(r.warnings.filter((w) => String(typeof w === 'string' ? w : JSON.stringify(w)).includes('onSelect'))).toEqual([])
      expect(r.code).toBe(transform(explicit, { target }).code)
    })
  }
})
