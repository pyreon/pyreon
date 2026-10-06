// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Kotlin chart emitters
// (plugins/charts/kotlin*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Kotlin.
import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
import { PlotChart, band } from '@pyreon/charts'
interface Row { m: string; v: number; lo: number; hi: number; o: number; h: number; l: number; c: number; vals: number[] }
const ROWS: Row[] = [{ m: 'Jan', v: 10, lo: 5, hi: 15, o: 1, h: 2, l: 0, c: 1, vals: [1, 2, 3] }]
const mk = () => (d: Row) => d.v
const handlers = { pick: (i: number) => { } }
export function C() { return <Stack><PlotChart data={ROWS} x={(d) => d.m} marks={[band(mk(), (d) => d.hi)]} height={200} /></Stack> }
