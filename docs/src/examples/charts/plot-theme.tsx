import { bars, ChartThemeProvider, line, palettes, PlotChart } from '@pyreon/charts/plot'
import type { ChartThemeMode } from '@pyreon/charts/plot'
import { signal, type Signal } from '@pyreon/reactivity'

/**
 * Live theme demo — one provider, every chart below it follows.
 *
 * Flip the mode and the SAME canvases repaint in place (no remount): the bars
 * take the dark palette, the ground and tick labels change with them. Pick a
 * named palette and it reaches both charts through `theme={{ palette }}` on the
 * provider — no mark carries a `color`, which is the whole point.
 *
 * The `shared` signal counts flips — bridge it with `<Example ... share="…" />`
 * and any other Example on the page reading it reacts; falls back to a local
 * signal when unbridged.
 */
interface Row {
  q: string
  revenue: number
  cost: number
}

const ROWS: Row[] = [
  { q: 'Q1', revenue: 42, cost: 31 },
  { q: 'Q2', revenue: 55, cost: 36 },
  { q: 'Q3', revenue: 49, cost: 34 },
  { q: 'Q4', revenue: 63, cost: 40 },
]

const PALETTE_NAMES = ['pyreon', 'observable10', 'tableau10', 'okabeIto', 'echarts6', 'tailwind'] as const
type PaletteName = (typeof PALETTE_NAMES)[number]

export default function PlotTheme(props: { shared?: Signal<number> }) {
  const flips = props.shared ?? signal(0)
  const mode = signal<ChartThemeMode>('light')
  const paletteName = signal<PaletteName>('pyreon')

  const flip = () => {
    mode.set(mode() === 'light' ? 'dark' : 'light')
    flips.update((n) => n + 1)
  }

  return (
    <div class="example-col">
      <div class="example-row" style={{ flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
        <button type="button" onClick={flip}>
          Mode: {() => mode()}
        </button>
        <label>
          Palette{' '}
          <select value={() => paletteName()} onChange={(e) => paletteName.set((e.currentTarget as HTMLSelectElement).value as PaletteName)}>
            {PALETTE_NAMES.map((n) => (
              <option value={n}>{n}</option>
            ))}
          </select>
        </label>
        <span>flips: {() => flips()}</span>
      </div>

      {/*
        The provider is the only place theming happens: `mode` is an accessor,
        so a flip re-resolves the theme; `theme` carries the palette override.
      */}
      <ChartThemeProvider mode={() => mode()} theme={() => ({ palette: [...palettes[paletteName()]] })}>
        <PlotChart<Row>
          data={ROWS}
          x={(d) => d.q}
          marks={[bars((d) => d.revenue, { label: 'Revenue' }), line((d) => d.cost, { label: 'Cost', width: 2 })]}
          showLegend
          tooltip
          height={220}
          animate={false}
        />
      </ChartThemeProvider>
    </div>
  )
}
