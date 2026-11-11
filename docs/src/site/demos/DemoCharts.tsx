// This module IS the lazy chunk: registry.tools.ts loads it through island(() => import(…)).
// pyreon-lint-disable-next-line pyreon/no-eager-import
import { Area, Axis, Bar, Chart, ChartThemeProvider, Dot, Legend, Line, Tooltip } from '@pyreon/charts'
import type { ChartTheme } from '@pyreon/charts'
import { computed, signal } from '@pyreon/reactivity'
import { color, font, radius, text } from '../theme'
import { el, tone, txt } from '../kit/bases'
import { GlowCard } from '../kit/cards'
import { CodeBlock } from '../kit/code'
import { Segmented } from '../kit/controls'
import { DemoGrid } from '../kit/demo'
import { Eyebrow } from '../kit/type'

type Mark = 'Bar' | 'Line' | 'Area' | 'Dot'
type Field = 'revenue' | 'users'
interface Row {
  month: string
  revenue: number
  users: number
  target: number
}

const MARKS: readonly Mark[] = ['Bar', 'Line', 'Area', 'Dot']
const FIELDS: readonly Field[] = ['revenue', 'users']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug']
const VALUES: Record<Field, readonly number[]> = {
  revenue: [42, 51, 48, 63, 71, 68, 84, 92],
  users: [1.2, 1.9, 2.4, 2.2, 3.1, 3.8, 4.0, 4.9],
}
const TARGETS: Record<Field, readonly number[]> = {
  revenue: [45, 50, 55, 60, 65, 70, 75, 80],
  users: [1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5],
}

/** One formatter feeds the axis, the tooltip, the data table and the spoken description. */
const usd = (v: number): string => `$${Math.round(v)}K`
const thousands = (v: number): string => `${v.toFixed(1)}k`
const FORMAT: Record<Field, { fn: (v: number) => string; name: string }> = {
  revenue: { fn: usd, name: 'usd' },
  users: { fn: thousands, name: 'thousands' },
}

/**
 * The chart's colours are the site's own tokens for each mode. The mode is
 * not wired here: the chart reads the framework-wide colour mode, which (in an
 * island with no `<PyreonUI>` above it) is the `color-scheme` the site's
 * theme toggle writes on <html>, so the canvas repaints when the page flips.
 */
const chartTone = (mode: 'light' | 'dark'): Partial<ChartTheme> => ({
  palette: [color.accent[mode], color.link[mode]],
  background: '',
  surface: color.card[mode],
  text: color.text[mode],
  label: color.mist[mode],
  axis: color.line2[mode],
  grid: color.line[mode],
  fontFamily: '',
  radius: 3,
})
const LIGHT = chartTone('light')
const DARK = chartTone('dark')

const Controls = el
  .config({ name: 'ChartsDemoControls' })
  .attrs({ block: true, gap: 12 })
  .theme(() => ({ minWidth: 0 }))

const ControlRow = el
  .config({ name: 'ChartsDemoControlRow' })
  .attrs({ block: true })
  .theme(() => ({
    display: 'grid',
    // The label sits above its switch on narrow phones, beside it from 576px.
    gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: '56px minmax(0, 1fr)' },
    alignItems: 'center',
    gap: { xs: 6, sm: 10 },
    minWidth: 0,
  }))

const CodeWell = el
  .config({ name: 'ChartsDemoCode' })
  .attrs({ block: true })
  .theme((_t, m) => ({
    minWidth: 0,
    marginTop: 4,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    borderRadius: radius.control,
    backgroundColor: tone(m, 'well'),
    extendCss: '& > pre { padding: 16px 18px; }',
  }))

const Hint = txt
  .config({ name: 'ChartsDemoHint' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({ margin: 0, fontFamily: font.sans, fontSize: text.caption.size, lineHeight: text.caption.lineHeight, color: tone(m, 'fog') }))

const Kbd = txt
  .config({ name: 'ChartsDemoKbd' })
  .attrs({ tag: 'kbd' })
  .theme((_t, m) => ({
    fontFamily: font.mono,
    fontSize: 11,
    paddingLeft: 5,
    paddingRight: 5,
    borderRadius: radius.small,
    border: '1px solid',
    borderColor: tone(m, 'line2'),
    color: tone(m, 'text'),
  }))

const Plot = el
  .config({ name: 'ChartsDemoPlot' })
  .attrs({ block: true, contentAlignX: 'block' })
  .theme((_t, m) => ({
    minWidth: 0,
    minHeight: 300,
    position: 'relative',
    // The canvas is the chart's tab stop: give it the site's focus ring.
    extendCss: `& canvas:focus-visible { outline: 2px solid ${tone(m, 'focus')}; outline-offset: 4px; border-radius: ${radius.small}px; }`,
  }))

function codeFor(mark: Mark, field: Field): string {
  return [
    '<Chart data={rows} x="month" by="month">',
    `  <${mark} y="${field}" label="${field}" />`,
    '  <Line y="target" label="target" dash={[5, 4]} />',
    `  <Axis y format={${FORMAT[field].name}} />`,
    '  <Tooltip /> <Legend />',
    '</Chart>',
  ].join('\n')
}

/** The first child: the mark the visitor picked, on the field they picked. */
function markFor(mark: Mark, field: Field) {
  if (mark === 'Line') return <Line y={field} label={field} />
  if (mark === 'Area') return <Area y={field} label={field} />
  if (mark === 'Dot') return <Dot y={field} label={field} />
  return <Bar y={field} label={field} />
}

/**
 * Charts demo (`charts.json` → demo): a real `@pyreon/charts` `<Chart>` over
 * eight monthly rows. The mark control swaps the first child between `<Bar>`,
 * `<Line>`, `<Area>` and `<Dot>`; the data control switches its field. The
 * children are one accessor, which `<Chart>` re-scans inside its own
 * computed, so the same canvas repaints in place (rows keyed by month tween
 * to their new values). The keyboard focus, the spoken description and the
 * visually hidden data table are the package's, not this demo's.
 */
export default function DemoCharts() {
  const mark = signal<Mark>('Bar')
  const field = signal<Field>('revenue')

  const rows = computed<Row[]>(() => {
    const f = field()
    return MONTHS.map((month, i) => ({
      month,
      revenue: VALUES.revenue[i] ?? 0,
      users: VALUES.users[i] ?? 0,
      target: TARGETS[f][i] ?? 0,
    }))
  })

  return (
    <DemoGrid>
      <GlowCard padding="compact">
        <Controls>
          <ControlRow>
            <Eyebrow>mark</Eyebrow>
            <Segmented label="Mark" options={MARKS} value={() => mark()} onChange={(v) => mark.set(v)} />
          </ControlRow>
          <ControlRow>
            <Eyebrow>data</Eyebrow>
            <Segmented label="Data" options={FIELDS} value={() => field()} onChange={(v) => field.set(v)} />
          </ControlRow>
          <CodeWell>
            <CodeBlock label="The JSX being rendered" code={codeFor(mark(), field())} />
          </CodeWell>
          <Hint>
            Tab into the chart, then use <Kbd>←</Kbd> <Kbd>→</Kbd> to step through the months: the focus ring, the spoken
            description and the hidden data table come with every chart.
          </Hint>
        </Controls>
      </GlowCard>
      <GlowCard padding="compact">
        <Plot>
          <ChartThemeProvider light={LIGHT} dark={DARK}>
            <Chart<Row>
              data={() => rows()}
              x="month"
              by="month"
              height={300}
              title="Monthly figures against target"
              showTitle={false}
            >
              {() => {
                const f = field()
                return [
                  markFor(mark(), f),
                  <Line y="target" label="target" dash={[5, 4]} />,
                  <Axis y format={FORMAT[f].fn} />,
                  <Tooltip />,
                  <Legend />,
                ]
              }}
            </Chart>
          </ChartThemeProvider>
        </Plot>
      </GlowCard>
    </DemoGrid>
  )
}
