// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Kotlin chart emitters
// (plugins/charts/kotlin*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Kotlin.
import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
import { PlotChart, bars } from '@pyreon/charts'
interface Row { m: string; v: number }
const ROWS: Row[] = [{ m: 'Jan', v: 10 }]
export function C() { const w = signal(1); return <Stack><PlotChart data={ROWS} x={(d) => d.m} marks={[bars((d) => d.v, { gradient: { stops: [{ offset: 0, color: 3 }] } })]} height={200} /></Stack> }
