// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Kotlin chart emitters
// (plugins/charts/kotlin*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Kotlin.
// An explicit accessibility label — a literal and an interpolated one — read through the facade's string-attribute reader.
import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
import { PlotChart, PieChart, bars } from '@pyreon/charts/engine'
interface Row { n: string; v: number }
const ROWS: Row[] = [{ n: 'a', v: 1 }]
export function Labelled() {
  const total = signal(3)
  return (
    <Stack>
      <PlotChart data={ROWS} x={(d) => d.n} marks={[bars((d) => d.v)]} accessibilityLabel="Sales by month" height={200} />
      <PieChart data={ROWS} value={(d) => d.v} label={(d) => d.n} accessibilityLabel={`Share of ${total()} items`} height={200} />
    </Stack>
  )
}
