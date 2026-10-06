// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Kotlin chart emitters
// (plugins/charts/kotlin*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Kotlin.
import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
interface Row { n: string; v: number; o: number; h: number; l: number; c: number; vals: number[] }
const ROWS: Row[] = [{ n: 'a', v: 1, o: 1, h: 2, l: 0, c: 1, vals: [1, 2, 3] }]
import { BoxplotChart } from '@pyreon/charts'
const mk = () => (d: Row) => d.n
export function C() { return <Stack><BoxplotChart data={ROWS} values={(d) => d.vals} x={mk()} /></Stack> }
