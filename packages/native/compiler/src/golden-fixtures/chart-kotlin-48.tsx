// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Kotlin chart emitters
// (plugins/charts/kotlin*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Kotlin.
import { PlotChart, line, sma, ema, trend } from '@pyreon/charts/engine'
interface Row { m: string; v: number }
const ROWS: Row[] = [{ m: 'Jan', v: 10 }, { m: 'Feb', v: 14 }]
export function App() {
  return (
    <PlotChart
      data={ROWS}
      x={(d) => d.m}
      height={200}
      marks={[line((d) => d.v), sma((d) => d.v, 3), ema((d) => d.v, 5), trend((d) => d.v)]}
    />
  )
}
