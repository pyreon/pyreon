// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Kotlin chart emitters
// (plugins/charts/kotlin*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Kotlin.
import { Stack } from '@pyreon/primitives'
import { HeatmapChart } from '@pyreon/charts/engine'
interface Cell { d: string; hour: string; n: number }
const CELLS: Cell[] = [{ d: 'Mon', hour: '09', n: 3 }]
export function Heat() {
  return (<Stack><HeatmapChart animate={false} data={CELLS} x={(d) => d.hour} y={(d) => d.d} value={(d) => d.n} height={160} onSelectIndex={(i: number) => console.log(i)} /></Stack>)
}
