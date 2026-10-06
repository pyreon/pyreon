// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Kotlin chart emitters
// (plugins/charts/kotlin*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Kotlin.
import { signal } from '@pyreon/reactivity'
import { Stack, Text, Scroll, For } from '@pyreon/primitives'
import { PieChart } from '@pyreon/charts/engine'
import { PlotChart, bars, bubble } from '@pyreon/charts/engine'
interface Row { m: string; v: number; r: number }
const ROWS: Row[] = [{ m: 'Jan', v: 1, r: 2 }]
export function C() { return (<Stack><PlotChart data={ROWS} x={(d) => d.m} marks={[bars((d) => d.v)]} title="T" showTitle height={200} /></Stack>) }
