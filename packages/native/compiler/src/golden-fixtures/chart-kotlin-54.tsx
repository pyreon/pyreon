// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Kotlin chart emitters
// (plugins/charts/kotlin*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Kotlin.
import { Stack } from '@pyreon/primitives'
import { GaugeChart } from '@pyreon/charts'
import { PieChart, PlotChart, bars, band } from '@pyreon/charts/engine'
interface Row { m: string; v: number; lo: number; hi: number }
const ROWS: Row[] = [{ m: 'Jan', v: 10, lo: 5, hi: 15 }]
export function Declines() {
  return (
    <Stack>
      <PlotChart data={ROWS} x={(d) => d.m} marks={[bars((d) => d.v, { gradient: { stops: [{ offset: 0 }] } })]} height={200} />
      <PlotChart data={ROWS} x={(d) => d.m} marks={[bars((d) => d.v, { pattern: { kind: 'dots' } })]} height={200} />
      <PlotChart data={ROWS} x={(d) => d.m} marks={[band((d) => d.hi)]} height={200} />
      <GaugeChart value={0.4} dial height={160} />
      <PieChart data={ROWS} value={(d) => d.v} label={(d) => d.m} toolbox={{ restore: true }} height={200} />
    </Stack>
  )
}
