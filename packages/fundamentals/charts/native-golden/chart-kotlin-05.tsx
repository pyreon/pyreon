// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Kotlin chart emitters
// (plugins/charts/kotlin*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Kotlin.
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
import { Chart, Bar, Line, Dot, Rule, Axis, Tooltip, Legend, Zoom, compact } from '@pyreon/charts'
import type { BrushRange } from '@pyreon/charts'
interface Month { name: string; revenue: number; cost: number; size: number }
const MONTHS: Month[] = [{ name: 'Jan', revenue: 12, cost: 8, size: 2 }, { name: 'Feb', revenue: 15, cost: 9, size: 3 }]
function onBrush(r: BrushRange | null) {
  if (r == null) return
}
export function Revenue() {
  const picked = signal(-1)
  return (
    <Stack>
      <Text>{picked()}</Text>
      <Chart data={MONTHS} x="name" height={240} theme={{ palette: ['#111111', '#222222'] }} onSelect={(i: number) => picked.set(i)}>
        <Bar y="revenue" label="Revenue" />
        <Line y={(d: Month) => d.cost} label="Cost" width={3} />
        <Dot y="revenue" r="size" label="Size" />
        <Rule y={14} label="goal" color="#b42318" />
        <Axis y format={compact} />
        <Legend /><Tooltip crosshair /><Axis x time hidden /><Zoom brush={onBrush} inside={false} />

      </Chart>
    </Stack>
  )
}
