// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Kotlin chart emitters
// (plugins/charts/kotlin*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Kotlin.
import { PlotChart, bollinger } from '@pyreon/charts/engine'
interface Row { m: string; v: number }
const bad = [1]
const ROWS: Row[] = [{ m: 'Jan', v: 10 }, { m: 'Feb', v: 14 }, { m: 'Mar', v: 9 }]
export function C() {
  return <PlotChart data={ROWS} x={(d) => d.m} marks={[...bollinger((d) => d.v, 3, 2, { label: bad })]} height={200} />
}
