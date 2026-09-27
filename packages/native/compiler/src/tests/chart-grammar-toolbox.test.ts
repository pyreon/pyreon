// `<Toolbox>` is a child of `<Chart>` (the tool strip's code rides on it, so a
// chart without one does not bundle it on the web). On native the desugar
// turns it into the `toolbox` config the host already lowers.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const head = `import { signal } from '@pyreon/reactivity'
interface Row { m: string; v: number }
const ROWS: Row[] = [{ m: 'a', v: 3 }, { m: 'b', v: 5 }]
`
const grammar = `${head}import { Bar, Chart, Toolbox } from '@pyreon/charts'
export function App() {
  return <Chart data={ROWS} x="m" height={200}><Bar y="v" /><Toolbox saveAsImage restore magicType={['line', 'bar']} /></Chart>
}
`
const explicit = `${head}import { PlotChart, bars } from '@pyreon/charts/engine'
export function App() {
  return <PlotChart data={ROWS} x={(d) => d.m} height={200} marks={[bars((d) => d.v)]} toolbox={{ saveAsImage: true, restore: true, magicType: ['line', 'bar'] }} />
}
`
const pie = `${head}import { Arc, Chart, Toolbox } from '@pyreon/charts'
export function App() {
  return <Chart data={ROWS} height={200}><Arc value="v" label="m" /><Toolbox saveAsImage="svg" /></Chart>
}
`
const pieExplicit = `${head}import { PieChart } from '@pyreon/charts/engine'
export function App() {
  return <PieChart data={ROWS} height={200} value={(d) => d.v} label={(d) => d.m} toolbox={{ saveAsImage: true }} />
}
`

describe('<Toolbox> in the grammar', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: the cartesian chart lowers its toolbox exactly as <PlotChart toolbox>`, () => {
      const r = transform(grammar, { target })
      expect(r.warnings.filter((w) => String(w).includes('Toolbox'))).toEqual([])
      expect(r.code).toBe(transform(explicit, { target }).code)
    })
    it(`${target}: a family mark takes the PNG-only switch, as on the web`, () => {
      const r = transform(pie, { target })
      expect(r.warnings.filter((w) => String(w).includes('Toolbox'))).toEqual([])
      expect(r.code).toBe(transform(pieExplicit, { target }).code)
    })
  }
})
