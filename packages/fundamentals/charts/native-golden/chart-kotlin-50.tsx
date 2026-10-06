// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Kotlin chart emitters
// (plugins/charts/kotlin*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Kotlin.
import { PlotChart, line } from '@pyreon/charts/engine'
interface Row { m: string; v: number }
const ROWS: Row[] = [{ m: 'Jan', v: 10 }, { m: 'Feb', v: 40 }]
export function C() {
  return <PlotChart data={ROWS} x={(d) => d.m} marks={[line((d) => d.v)]} yDomain={{ min: 0.0, max: 100.0 }} height={200} />
}
