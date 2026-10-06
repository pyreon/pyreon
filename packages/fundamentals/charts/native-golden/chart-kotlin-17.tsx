// Golden-only: a shape harvested from the chart test suite that the rest of the corpus does not reach in the Kotlin chart emitters
// (plugins/charts/kotlin*.ts). Its expected output was recorded from the PRE-MOVE emitter, so a change here is a change of emitted Kotlin.
import { Stack } from '@pyreon/primitives'
import { RadarChart } from '@pyreon/charts'
import { CandlestickChart, HeatmapChart } from '@pyreon/charts/engine'
import type { RadarAxis } from '@pyreon/charts'
interface Bar { day: string; o: number; h: number; l: number; c: number }
interface Cell { d: string; hour: string; n: number }
interface Team { name: string; scores: number[] }
const BARS: Bar[] = [{ day: 'Mon', o: 10, h: 12, l: 9, c: 11 }, { day: 'Tue', o: 11, h: 13, l: 10, c: 12 }]
const CELLS: Cell[] = [{ d: 'Mon', hour: '09', n: 3 }, { d: 'Mon', hour: '10', n: 5 }, { d: 'Tue', hour: '09', n: 1 }]
const TEAMS: Team[] = [{ name: 'A', scores: [3, 4, 5] }]
const AXES: RadarAxis[] = [{ label: 'x', max: 5 }, { label: 'y', max: 5 }, { label: 'z', max: 5 }]
export function Frames() {
  return (
    <Stack>
      <CandlestickChart data={BARS} open={(d) => d.o} high={(d) => d.h} low={(d) => d.l} close={(d) => d.c} x={(d) => d.day} height={180} onSelect={(i: number) => console.log(i)} />
      <HeatmapChart animate={false} data={CELLS} x={(d) => d.hour} y={(d) => d.d} value={(d) => d.n} gap={2} width={240} height={160} data-testid="heat" />
      <RadarChart data={TEAMS} axes={AXES} values={(d) => d.scores} label={(d) => d.name} rings={3} height={220} title="Skills" />
    </Stack>
  )
}
