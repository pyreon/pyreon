// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Kotlin chart emitters
// (plugins/charts/kotlin*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Kotlin.
import { PieChart } from '@pyreon/charts/engine'
interface Row { n: string; v: number }
const ROWS: Row[] = [{ n: 'a', v: 1 }, { n: 'b', v: 2 }]
export function Share() {
  return <PieChart data={ROWS} value={(d) => d.v} label={(d) => d.n} showLegend legendPosition="left" height={200} onSelectIndex={(i: number) => console.log(i)} />
}
