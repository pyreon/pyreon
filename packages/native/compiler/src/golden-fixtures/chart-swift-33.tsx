// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Swift chart emitters
// (plugins/charts/swift*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Swift.
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
import { PlotChart, bars, line } from '@pyreon/charts/engine'
interface Day { label: string; hits: number; avg: number }
const DAYS: Day[] = [{ label: 'Mon', hits: 3, avg: 2 }, { label: 'Tue', hits: 5, avg: 3 }, { label: 'Wed', hits: 2, avg: 3 }, { label: 'Thu', hits: 7, avg: 4 }]
export function Traffic() {
  const picked = signal(-1)
  return (
    <Stack>
      <Text>{picked()}</Text>
      <PlotChart animate={false} data={DAYS} x={(d) => d.label} marks={[bars((d) => d.hits), line((d, i) => d.avg + i)]} dataZoom={true} height={200} onSelect={(i: number) => picked.set(i)} />
    </Stack>
  )
}
