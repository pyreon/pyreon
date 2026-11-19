import { Axis, Chart, Dot, Line, Tooltip } from '@pyreon/charts'
import { signal } from '@pyreon/reactivity'

/**
 * Gallery — non-linear axes. The same populations on a linear, sqrt, symlog and
 * log x axis: `xScale` reshapes the picture, while the tooltip, the accessible
 * table and the tick labels keep the REAL values. log places only values above
 * zero (the rest are gaps), sqrt from zero up, symlog everything.
 */
interface Place {
  name: string
  people: number
  score: number
}

const PLACES: Place[] = [
  { name: 'Hamlet', people: 40, score: 3 },
  { name: 'Village', people: 900, score: 5 },
  { name: 'Town', people: 18_000, score: 4 },
  { name: 'City', people: 650_000, score: 7 },
  { name: 'Metropolis', people: 9_000_000, score: 8 },
]

type Scale = 'linear' | 'sqrt' | 'symlog' | 'log'

export default function GalleryScales() {
  const scale = signal<Scale>('log')
  return (
    <div class="example-col">
      <div class="example-row">
        {(['linear', 'sqrt', 'symlog', 'log'] as const).map((s) => (
          <button type="button" onClick={() => scale.set(s)} aria-pressed={() => scale() === s}>
            {s}
          </button>
        ))}
      </div>
      <Chart<Place> data={PLACES} xValue="people" height={240} title="Score by population">
        <Line<Place> y="score" label="Score" />
        <Dot<Place> y="score" label="Score" />
        <Axis x scale={scale()} title="Population" />
        <Tooltip />
      </Chart>
    </div>
  )
}
