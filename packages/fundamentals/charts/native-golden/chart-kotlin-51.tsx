// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Kotlin chart emitters
// (plugins/charts/kotlin*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Kotlin.
import { CalendarChart } from '@pyreon/charts'
export function App(props: { vm: { min: number } }) {
  return <CalendarChart animate={false} start="2026-01-01" end="2026-01-31" values={{ '2026-01-05': 3 }} visualMap={props.vm} height={180} />
}
