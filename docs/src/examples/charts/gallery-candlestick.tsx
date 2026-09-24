import { Candle, Chart, Tooltip, Zoom } from '@pyreon/charts'
import type { Signal } from '@pyreon/reactivity'

/**
 * Gallery — a price chart: 120 seeded candles with a navigator strip under the
 * plot. Drag the strip's band or a handle, or scroll and drag inside the plot.
 * The labels thin to what fits.
 */
interface Day {
  day: string
  open: number
  high: number
  low: number
  close: number
}

function ohlc(n: number): Day[] {
  let seed = 7
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0xffffffff)
  const out: Day[] = []
  let close = 100
  for (let i = 0; i < n; i++) {
    const open = close
    close = Math.max(20, open + (rnd() - 0.48) * 6)
    out.push({
      day: `D${i + 1}`,
      open: +open.toFixed(2),
      close: +close.toFixed(2),
      high: +(Math.max(open, close) + rnd() * 3).toFixed(2),
      low: +(Math.min(open, close) - rnd() * 3).toFixed(2),
    })
  }
  return out
}

const DAYS = ohlc(120)

export default function GalleryCandlestick(_props: { shared?: Signal<number> }) {
  return (
    <Chart<Day> data={DAYS} x="day" height={340}>
      <Candle open="open" high="high" low="low" close="close" />
      <Zoom navigator />
      <Tooltip />
    </Chart>
  )
}
