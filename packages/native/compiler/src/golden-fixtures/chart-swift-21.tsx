// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Swift chart emitters
// (plugins/charts/swift*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Swift.
import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
import { RadarChart, BoxplotChart } from '@pyreon/charts'
import { HeatmapChart, CandlestickChart, PlotChart, bars, visualMap } from '@pyreon/charts/engine'
export function C() {
  const rows = signal<{ x: string; y: string; v: number; o: number; h: number; l: number; c: number; vals: number[]; name: string }[]>([])
  const axes = signal<string[]>(['a', 'b'])
  const k = 'stripe'
  return (<Stack><PlotChart data={rows()} marks={[bars((d) => d.v, ...rest)]} /></Stack>)
}
