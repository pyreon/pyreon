// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Kotlin chart emitters
// (plugins/charts/kotlin*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Kotlin.
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
import { Chart, Bar, Label, Rule } from '@pyreon/charts'
interface Month { name: string; revenue: number; cost: number; size: number }
const MONTHS: Month[] = [{ name: 'Jan', revenue: 12, cost: 8, size: 2 }, { name: 'Feb', revenue: 15, cost: 9, size: 3 }]
export function Peaks() {
  return (<Stack><Chart data={MONTHS} x="name" height={200}><Bar y="revenue" /><Label at="max" text="Peak" color="#b42318" /><Label series={0} at={1} text="Feb" radius={6} /><Rule x={0.5} label="launch" /></Chart></Stack>)
}
