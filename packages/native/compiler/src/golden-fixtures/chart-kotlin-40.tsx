// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Kotlin chart emitters
// (plugins/charts/kotlin*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Kotlin.
import { PlotChart, bollinger } from '@pyreon/charts/engine'
interface Row { m: string; v: number }
const makeAcc = () => (d: Row) => d.v
const ROWS: Row[] = [{ m: 'Jan', v: 10 }, { m: 'Feb', v: 14 }, { m: 'Mar', v: 9 }]
export function C() {
  return <PlotChart data={ROWS} x={(d) => d.m} marks={[...bollinger(makeAcc(), 3)]} height={200} />
}
