// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Kotlin chart emitters
// (plugins/charts/kotlin*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Kotlin.
import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
import { PlotChart, bars } from '@pyreon/charts'
interface Row { m: string; v: number; lo: number; hi: number; r: number; vs: number[] }
const ROWS: Row[] = [{ m: 'Jan', v: 10, lo: 5, hi: 15, r: 3, vs: [1, 2] }]
const mk = () => (d: Row) => d.v
export function C() { const w = signal(1); return <Stack><PlotChart data={ROWS} x={(d) => d.m} marks={[bars((d) => d.v)]} dataZoom zoomPresets={[1, 2]} height={200} /></Stack> }
