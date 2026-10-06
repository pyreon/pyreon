// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Kotlin chart emitters
// (plugins/charts/kotlin*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Kotlin.
import { Stack } from '@pyreon/primitives'
import { PieChart } from '@pyreon/charts/engine'
interface Row { m: string; vs: number[] }
const ROWS: Row[] = [{ m: 'Jan', vs: [1, 2] }]
export function C() { return <Stack><PieChart data={ROWS} value={(d) => d.vs.map((d) => d).length} label={(d) => d.m} /></Stack> }
