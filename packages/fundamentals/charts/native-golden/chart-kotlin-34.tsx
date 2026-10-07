// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Kotlin chart emitters
// (plugins/charts/kotlin*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Kotlin.
import { Bar, Histogram, Chart } from '@pyreon/charts'
import { PlotChart, bars } from '@pyreon/charts/engine'
import { Stack } from '@pyreon/primitives'
interface Row { m: string; v: number; lo: number; hi: number; r: string }
const ROWS: Row[] = [{ m: 'Jan', v: 10, lo: 8, hi: 12, r: 'eu' }]
export function App() {
  return (
    <Stack>
      <PlotChart data={ROWS} x={(d) => d.m} marks={[bars((d) => d.v, { errorLow: (d) => d.lo, errorHigh: (d) => d.hi })]} locale="de-DE" />
      <Chart data={ROWS} facet="r" facetColumns={2}>
        <Histogram x="v" bins={5} />
        <Bar y="v" />
      </Chart>
    </Stack>
  )
}
