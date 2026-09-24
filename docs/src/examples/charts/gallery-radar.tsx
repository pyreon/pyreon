import { ChartThemeProvider } from '@pyreon/charts'
import { OptionChart } from '@pyreon/charts/option'
import type { Signal } from '@pyreon/reactivity'

/**
 * Gallery — a radar comparison from an ECharts option: two filled series over
 * six named indicators, each with its own maximum.
 * The provider opts it into the colour mode in scope — the page's scheme
 * here (the root's `color-scheme`); a bare option chart keeps ECharts' own light look.
 */
export default function GalleryRadar(_props: { shared?: Signal<number> }) {
  return (
    <ChartThemeProvider>
      <OptionChart
        height={320}
        option={{
          legend: { bottom: 0 },
          tooltip: {},
          radar: {
            indicator: [
              { name: 'Speed', max: 100 },
              { name: 'Size', max: 100 },
              { name: 'DX', max: 100 },
              { name: 'Ecosystem', max: 100 },
              { name: 'SSR', max: 100 },
              { name: 'Native', max: 100 },
            ],
          },
          series: [
            {
              type: 'radar',
              areaStyle: { opacity: 0.2 },
              data: [
                { name: 'Framework A', value: [92, 88, 80, 55, 90, 85] },
                { name: 'Framework B', value: [70, 60, 85, 95, 75, 40] },
              ],
            },
          ],
        }}
      />
    </ChartThemeProvider>
  )
}
