// The indicator marks — `<Sma>`, `<Ema>`, `<Trend>`, `<Bollinger>` — desugar
// to the array form's `sma` / `ema` / `trend` / `...bollinger` calls, so the
// emitters' existing indicator lowering runs unchanged. The contract is that
// the two spellings emit BYTE-IDENTICAL Swift and Kotlin, with no warning.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const head = `interface Row { m: string; v: number }
const ROWS: Row[] = [{ m: 'a', v: 3 }, { m: 'b', v: 5 }, { m: 'c', v: 4 }, { m: 'd', v: 8 }]
`
const grammar = `${head}import { Bollinger, Chart, Ema, Line, Sma, Trend } from '@pyreon/charts'
export function App() {
  return (
    <Chart data={ROWS} x="m" height={200}>
      <Line y="v" label="Value" />
      <Sma y="v" window={3} label="SMA 3" />
      <Ema y="v" window={2} />
      <Trend y="v" />
      <Bollinger y="v" window={3} k={1.5} />
    </Chart>
  )
}
`
const explicit = `${head}import { PlotChart, bollinger, ema, line, sma, trend } from '@pyreon/charts/engine'
export function App() {
  return <PlotChart data={ROWS} x={(d) => d.m} height={200} marks={[line((d) => d.v, { label: 'Value' }), sma((d) => d.v, 3, { label: 'SMA 3' }), ema((d) => d.v, 2), trend((d) => d.v), ...bollinger((d) => d.v, 3, 1.5)]} />
}
`
// An absent `k` with options after it: the desugar must put the default in
// the third slot, because bollinger's options are its fourth argument.
const defaultK = `${head}import { Bollinger, Chart } from '@pyreon/charts'
export function App() {
  return <Chart data={ROWS} x="m" height={200}><Bollinger y="v" window={3} label="Env" /></Chart>
}
`
const defaultKExplicit = `${head}import { PlotChart, bollinger } from '@pyreon/charts/engine'
export function App() {
  return <PlotChart data={ROWS} x={(d) => d.m} height={200} marks={[...bollinger((d) => d.v, 3, 2.0, { label: 'Env' })]} />
}
`
const noWindow = `${head}import { Chart, Line, Sma } from '@pyreon/charts'
export function App() {
  return <Chart data={ROWS} x="m" height={200}><Line y="v" /><Sma y="v" /></Chart>
}
`

describe('indicator marks in the grammar', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: emits exactly what the array form emits`, () => {
      const r = transform(grammar, { target })
      expect(r.warnings).toEqual([])
      expect(r.code).toBe(transform(explicit, { target }).code)
      expect(r.code).toContain('smaValues(')
      expect(r.code).toContain('bollingerEdge(')
    })
    it(`${target}: <Bollinger> without k keeps its options in place`, () => {
      const r = transform(defaultK, { target })
      expect(r.warnings).toEqual([])
      expect(r.code).toBe(transform(defaultKExplicit, { target }).code)
    })
    it(`${target}: a missing window is named, not silently dropped`, () => {
      const r = transform(noWindow, { target })
      expect(r.warnings.some((w) => String(w).includes('<Sma>: needs a `window`'))).toBe(true)
    })
  }
})
