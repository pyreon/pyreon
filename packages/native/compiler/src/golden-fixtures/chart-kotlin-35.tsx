// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Kotlin chart emitters
// (plugins/charts/kotlin*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Kotlin.
import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
interface Row { n: string; v: number; o: number; h: number; l: number; c: number; vals: number[] }
const ROWS: Row[] = [{ n: 'a', v: 1, o: 1, h: 2, l: 0, c: 1, vals: [1, 2, 3] }]
import { CandlestickChart } from '@pyreon/charts'
const mk = () => (d: Row) => d.n
export function C() { return <Stack><CandlestickChart data={ROWS} x={mk()} open={(d) => d.o} high={(d) => d.h} low={(d) => d.l} close={(d) => d.c} /></Stack> }
