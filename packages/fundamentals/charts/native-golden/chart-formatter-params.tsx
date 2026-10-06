// Golden-only: a chart formatter that is a USER helper with a `number` parameter. The slot is the evidence that the parameter is a Double,
// and the helper's return type is inferred over the widened parameter (so the widening must land during parse, not after).
// Recorded from the pre-move parser (`refineChartFormatterParams` in parse.ts) — a change here is a change of emitted Swift/Kotlin.
import { Stack } from '@pyreon/primitives'
import { Chart, Bar, Axis } from '@pyreon/charts'
import { PlotChart, bars } from '@pyreon/charts/engine'
interface Row { name: string; v: number }
const ROWS: Row[] = [{ name: 'a', v: 1 }, { name: 'b', v: 2 }]
function kg(v: number) { return `${v} kg` }
function twice(v: number) { return v }
function grammar(v: number) { return `${v}!` }
export function Props() {
  function local(v: number) { return `${v}%` }
  return (
    <Stack>
      <PlotChart data={ROWS} x={(d) => d.name} marks={[bars((d) => d.v)]} format={kg} xFormat={twice} y2Format={local} height={200} />
      <Chart data={ROWS}><Bar x="name" y="v" /><Axis format={grammar} /></Chart>
    </Stack>
  )
}
