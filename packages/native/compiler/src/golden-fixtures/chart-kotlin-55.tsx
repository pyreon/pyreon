// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Kotlin chart emitters
// (plugins/charts/kotlin*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Kotlin.
// A spread on a chart host: the dispatcher warns that its props are dropped (the registry claim must keep that warning).
import { Stack } from '@pyreon/primitives'
import { PieChart } from '@pyreon/charts/engine'
interface Row { n: string; v: number }
const ROWS: Row[] = [{ n: 'a', v: 1 }]
export function Share(props: { size: number }) {
  const extra = { height: props.size }
  return (
    <Stack>
      <PieChart data={ROWS} value={(d) => d.v} label={(d) => d.n} {...extra} />
    </Stack>
  )
}
