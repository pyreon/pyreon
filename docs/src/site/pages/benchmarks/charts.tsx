import { ColorModeProvider, For } from '@pyreon/core'
import { Axis, Bar, Chart, ChartThemeProvider, Legend, Line, Scale, Tooltip } from '@pyreon/charts'
import type { ChartTheme } from '@pyreon/charts'
import { computed, signal } from '@pyreon/reactivity'
import { fill } from '../../content/fill'
import type { BenchmarksPage, BenchmarksTemplate, Verdict } from '../../content/types-site'
import { colorMode } from '../../color-mode'
import { color, font, palette, verdict as verdictTokens } from '../../theme'
import { el, tone, txt } from '../../kit/bases'
import { VerdictChip } from '../../kit/bench'
import { KitScope } from '../../kit/scope'
import { ToggleChips } from '../../kit/toggles'
import { formatAxisMs, formatMs, formatUs, scalingRows, sortedRowBoard } from './model'

/**
 * The live `@pyreon/charts` views of the row board and the scaling data,
 * loaded only by the chart island (`LiveChart.tsx`) and only when the reader
 * has not asked for reduced data, so the charts package never reaches a page
 * or a visitor that does not draw one. Canvas colours cannot read CSS
 * variables, so the chart theme takes the same tokens (`theme.ts`) per mode,
 * and the mode is the site's own colour-mode signal.
 */
const side = (mode: 'dark' | 'light'): Partial<ChartTheme> => ({
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
})

const ember = { dark: palette.ember.core, light: palette.emberOnPaper.core }

/** Row board: ember for Pyreon, the rival-bar grey for the rest. */
const ROWS_THEME = {
  dark: { ...side('dark'), palette: [ember.dark, color.bar.dark] },
  light: { ...side('light'), palette: [ember.light, color.bar.light] },
}
/** Scaling: Pyreon ember, Octane cyan, Solid violet (legend + line weight carry it, not colour alone). */
const SCALING_THEME = {
  dark: { ...side('dark'), palette: [ember.dark, verdictTokens.tie.dark, palette.violet] },
  light: { ...side('light'), palette: [ember.light, verdictTokens.tie.light, color.mist.light] },
}

/** The kit's theme (`KitScope`: the island hydrates as its own root) and the chart theme for the site's colour mode. */
function Themed(props: { theme: { dark: Partial<ChartTheme>; light: Partial<ChartTheme> }; children?: unknown }) {
  return (
    <KitScope>
      <ColorModeProvider mode={() => colorMode()}>
        <ChartThemeProvider dark={props.theme.dark} light={props.theme.light}>
          {props.children as never}
        </ChartThemeProvider>
      </ColorModeProvider>
    </KitScope>
  )
}

const Stack = el.config({ name: 'BenchChartStack' }).attrs({ block: true, contentAlignX: 'block', gap: 16 }).theme(() => ({ minWidth: 0 }))

const Note = el
  .config({ name: 'BenchChartNote' })
  .attrs({ tag: 'p', block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 10 })
  .theme((_t, m) => ({ margin: 0, flexWrap: 'wrap', fontFamily: font.sans, fontSize: 14, color: tone(m, 'mist') }))

const Live = txt.config({ name: 'BenchChartLive' }).attrs({ tag: 'span', 'aria-live': 'polite' })

interface RowDatum {
  name: string
  pyreon: number
  others: number
}

export function RowBoardChart(props: {
  frameworks: BenchmarksPage['frameworks']
  rowBoard: BenchmarksPage['rowBoard']
  rowVerdicts: BenchmarksPage['rowVerdicts']
  initial: string
  copy: BenchmarksTemplate['rows']['live']
}) {
  const c = props.copy
  const ops = Object.keys(props.rowBoard)
  const op = signal(ops.includes(props.initial) ? props.initial : (ops[0] ?? ''))
  const rows = computed<RowDatum[]>(() =>
    sortedRowBoard(props.frameworks, props.rowBoard[op()] ?? []).map((b) => ({
      name: b.name,
      pyreon: b.name === 'Pyreon' ? b.ms : 0,
      others: b.name === 'Pyreon' ? 0 : b.ms,
    })),
  )
  const verdict = () => props.rowVerdicts[op()] ?? (['info', ''] as [Verdict, string])
  return (
    <Themed theme={ROWS_THEME}>
      <Stack>
        <ToggleChips label={c.control} options={ops.map((o) => ({ value: o, label: o }))} value={() => op()} onChange={(v) => op.set(v)} />
        <Chart<RowDatum>
          data={() => rows()}
          x="name"
          by="name"
          horizontal
          height={380}
          title={fill(c.title, { op: op() })}
          showTitle={false}
          format={(v: number) => formatMs(v)}
        >
          <Bar<RowDatum> y="pyreon" stack label={c.pyreon} />
          <Bar<RowDatum> y="others" stack label={c.others} />
          <Axis y format={(v: number) => formatAxisMs(v)} />
          <Tooltip />
        </Chart>
        <Note>
          <VerdictChip verdict={verdict()[0]} />
          <Live>{() => `${op()}: ${verdict()[1]}`}</Live>
        </Note>
      </Stack>
    </Themed>
  )
}

const SERIES = ['Pyreon', 'Octane', 'Solid'] as const

export function ScalingChart(props: { scaling: BenchmarksPage['scaling']; copy: BenchmarksTemplate['scaling']['live'] }) {
  const c = props.copy
  const ops = (['select', 'partial update', 'swap'] as const).filter((k) => k in props.scaling)
  const op = signal<(typeof ops)[number]>(ops[0] ?? 'select')
  const rows = computed(() => scalingRows(props.scaling.sizes, props.scaling[op()]))
  return (
    <Themed theme={SCALING_THEME}>
      <Stack>
        <ToggleChips label={c.control} options={ops.map((o) => ({ value: o, label: o }))} value={() => op()} onChange={(v) => op.set(v)} />
        <Chart<Record<string, string | number>>
          data={() => rows()}
          x="size"
          height={340}
          title={fill(c.title, { op: op() })}
          showTitle={false}
          format={(v: number) => formatUs(v)}
        >
          <For each={SERIES} by={(s) => s}>
            {(s) => <Line y={(d: Record<string, string | number>) => Number(d[s])} label={s} width={s === 'Pyreon' ? 3.5 : 2} />}
          </For>
          <Scale y="log" />
          <Axis y format={(v: number) => formatUs(v)} />
          <Legend />
          <Tooltip />
        </Chart>
        <Note>
          <Live>{() => fill(c.note, { op: op() })}</Live>
        </Note>
      </Stack>
    </Themed>
  )
}
