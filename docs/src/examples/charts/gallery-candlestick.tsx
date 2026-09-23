import { ChartThemeProvider, OptionChart, systemChartMode } from '@pyreon/charts/plot'
import type { Signal } from '@pyreon/reactivity'

/**
 * Gallery — a price chart from an ECharts option: 120 seeded candlesticks,
 * opening on the latest 60 through `dataZoom`'s `start` / `end`. The labels
 * thin to what fits. (A candlestick draws the opening window; its zoom slider
 * and gestures are the cartesian host's and are not drawn here yet.)
 * The provider hands it the PAGE's scheme (`systemChartMode` reads the
 * root's `color-scheme`); a bare option chart keeps ECharts' own light look.
 */
function ohlc(n: number): { days: string[]; candles: number[][] } {
  let seed = 7
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0xffffffff)
  const days: string[] = []
  const candles: number[][] = []
  let close = 100
  for (let i = 0; i < n; i++) {
    const open = close
    close = Math.max(20, open + (rnd() - 0.48) * 6)
    const high = Math.max(open, close) + rnd() * 3
    const low = Math.min(open, close) - rnd() * 3
    days.push(`D${i + 1}`)
    // ECharts' candlestick order: open, close, low, high.
    candles.push([+open.toFixed(2), +close.toFixed(2), +low.toFixed(2), +high.toFixed(2)])
  }
  return { days, candles }
}

const { days, candles } = ohlc(120)

export default function GalleryCandlestick(_props: { shared?: Signal<number> }) {
  return (
    <ChartThemeProvider mode={systemChartMode()}>
      <OptionChart
        height={340}
        option={{
          tooltip: { trigger: 'axis' },
          grid: { left: 48, right: 16, top: 16, bottom: 60 },
          xAxis: { type: 'category', data: days },
          yAxis: { type: 'value', scale: true },
          dataZoom: [{ type: 'inside', start: 50, end: 100 }],
          series: [{ type: 'candlestick', data: candles }],
        }}
      />
    </ChartThemeProvider>
  )
}
