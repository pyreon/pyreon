import { GaugeChart, gaugeDial } from '@pyreon/charts'
import { signal, type Signal } from '@pyreon/reactivity'

/**
 * Gallery — a gauge whose value is a signal. `gaugeDial()` builds the full
 * dial (split lines, ticks, labels, a pointer and a progress arc) with every
 * part defaulted, so only what differs is written; reading the signal inside
 * it makes the dial repaint on a write. The `shared` signal counts nudges.
 */
export default function GalleryGauge(props: { shared?: Signal<number> }) {
  const nudges = props.shared ?? signal(0)
  const load = signal(64)
  const nudge = (d: number) => {
    load.set(Math.max(0, Math.min(100, load() + d)))
    nudges.update((n) => n + 1)
  }
  return (
    <div class="example-col">
      <div class="example-row">
        <button type="button" onClick={() => nudge(-10)}>
          −10
        </button>
        <button type="button" onClick={() => nudge(10)}>
          +10
        </button>
        <span>nudges: {() => nudges()}</span>
      </div>
      <GaugeChart
        value={() => load()}
        height={300}
        title="CPU"
        dial={gaugeDial({ data: [{ value: load(), name: 'CPU' }], progressShow: true, progressWidth: 14, lineWidth: 14, format: (v) => `${v}%` })}
      />
    </div>
  )
}
