import { Bar, Chart, Legend, Tooltip } from '@pyreon/charts'
import { signal } from '@pyreon/reactivity'

/**
 * Gallery — bar thickness. `barWidth` is a px ceiling on one bar, `barGap` the
 * space between the bars of a group (a fraction of a bar), `barCategoryGap` the
 * space between categories (a fraction of the band). The three sliders drive
 * the same chart; unset, the bars keep their band-proportional width.
 */
interface Quarter {
  q: string
  online: number
  retail: number
}

const DATA: Quarter[] = [
  { q: 'Q1', online: 120, retail: 80 },
  { q: 'Q2', online: 150, retail: 95 },
  { q: 'Q3', online: 135, retail: 110 },
  { q: 'Q4', online: 190, retail: 130 },
]

export default function GalleryBarGeometry() {
  const width = signal(24)
  const gap = signal(0.25)
  const category = signal(0.3)
  return (
    <div class="example-col">
      <div class="example-row">
        <label>
          barWidth {() => width()}px
          <input type="range" min="6" max="60" value={() => width()} onInput={(e) => width.set(Number((e.target as HTMLInputElement).value))} />
        </label>
        <label>
          barGap {() => gap().toFixed(2)}
          <input type="range" min="0" max="1" step="0.05" value={() => gap()} onInput={(e) => gap.set(Number((e.target as HTMLInputElement).value))} />
        </label>
        <label>
          barCategoryGap {() => category().toFixed(2)}
          <input type="range" min="0" max="0.8" step="0.05" value={() => category()} onInput={(e) => category.set(Number((e.target as HTMLInputElement).value))} />
        </label>
      </div>
      <Chart<Quarter> data={DATA} x="q" height={260} title="Sales by quarter" barWidth={width()} barGap={gap()} barCategoryGap={category()}>
        <Bar y="online" label="Online" group />
        <Bar y="retail" label="Retail" group />
        <Tooltip />
        <Legend />
      </Chart>
    </div>
  )
}
