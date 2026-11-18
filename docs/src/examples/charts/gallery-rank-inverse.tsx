import { Axis, Bar, Chart, Line, Tooltip } from '@pyreon/charts'
import { signal } from '@pyreon/reactivity'

/**
 * Gallery — a reversed value axis. `<Axis y inverse>` puts the high end at the
 * bottom (the left, on a horizontal chart), so a RANK chart reads 1 at the top
 * and a DEPTH profile reads depth going down. Bars and areas hang from the top;
 * the data, the tooltip and the accessible table keep their order.
 */
interface Team {
  name: string
  rank: number
}

interface Sample {
  hour: string
  depth: number
}

const TEAMS: Team[] = [
  { name: 'Ada', rank: 3 },
  { name: 'Bao', rank: 1 },
  { name: 'Cleo', rank: 4 },
  { name: 'Dev', rank: 2 },
]

const SAMPLES: Sample[] = [
  { hour: '00:00', depth: 12 },
  { hour: '04:00', depth: 30 },
  { hour: '08:00', depth: 55 },
  { hour: '12:00', depth: 41 },
  { hour: '16:00', depth: 78 },
]

export default function GalleryRankInverse() {
  const inverted = signal(true)
  return (
    <div class="example-col">
      <div class="example-row">
        <button type="button" onClick={() => inverted.set(!inverted())}>
          {() => (inverted() ? 'Axis reversed' : 'Axis normal')}
        </button>
      </div>
      <Chart<Team> data={TEAMS} x="name" height={200} title="Rank (1 is best)">
        <Bar<Team> y="rank" label="Rank" showValues />
        <Axis y inverse={inverted()} />
        <Tooltip />
      </Chart>
      <Chart<Sample> data={SAMPLES} x="hour" height={200} title="Depth over the day (m)">
        <Line<Sample> y="depth" label="Depth" />
        <Axis y inverse={inverted()} />
        <Tooltip />
      </Chart>
    </div>
  )
}
