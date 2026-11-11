import { ColorModeProvider } from '@pyreon/core'
import { Axis, Bar, Chart, ChartThemeProvider, compact, Tooltip } from '@pyreon/charts'
import type { ChartTheme } from '@pyreon/charts'
import { colorMode } from '../site/color-mode'
import { color, font, palette } from '../site/theme'
import type { Trend } from './stats'

interface ChartRow {
  label: string
  downloads: number
}

/**
 * The site's chart look per mode, from `theme.ts` (a canvas cannot read CSS
 * variables): kit surfaces and hairlines, mono labels, ember bars (the
 * AA-safe ember on paper). Same tokens as the benchmarks charts.
 */
const theme = (mode: 'dark' | 'light'): Partial<ChartTheme> => ({
  background: '',
  surface: color.card[mode],
  text: color.text[mode],
  label: color.fog[mode],
  axis: color.line2[mode],
  grid: color.line[mode],
  fontFamily: font.mono,
  fontSize: 11,
  radius: 3,
  enterMs: 0,
  palette: [mode === 'dark' ? palette.ember.core : palette.emberOnPaper.core],
})
const DARK = theme('dark')
const LIGHT = theme('light')

/** Weekly npm downloads as a bar chart (an island on `/open`). */
export default function TrendChart(props: { label: Trend['label']; points: Trend['points'] }) {
  const rows: ChartRow[] = props.points.map((p) => ({
    label: new Date(p.week).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
    downloads: p.downloads,
  }))
  return (
    <ColorModeProvider mode={() => colorMode()}>
      <ChartThemeProvider dark={DARK} light={LIGHT}>
        <Chart<ChartRow> data={rows} x="label" height={260} animate={false} title={`Weekly npm downloads, ${props.label}`}>
          <Bar y="downloads" label="Downloads" />
          <Axis y format={compact} />
          <Tooltip />
        </Chart>
      </ChartThemeProvider>
    </ColorModeProvider>
  )
}
