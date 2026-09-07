// The compiler inlines the web hosts' default ChartTheme (chart-hosts.ts
// CHART_THEME_DEFAULT) because the generated engine's `defaultTheme` is
// module-private. Two copies of one literal drift, so this locks them together
// against the engine SOURCE — imported by path, the way gen-chart-engine.ts reads
// it, rather than through a package dependency the compiler does not otherwise need.
import { join } from 'node:path'
import { CHART_THEMES, CHART_THEME_DEFAULT, CHART_THEME_FIELDS, NAMED_PALETTES, chartDouble } from '../chart-hosts'

const ENGINE = join(import.meta.dirname, '../../../../fundamentals/charts/src/engine')

it('CHART_THEME_DEFAULT is the engine defaultTheme, field for field, in declaration order', async () => {
  const { defaultTheme } = (await import(join(ENGINE, 'render.ts'))) as { defaultTheme: Record<string, unknown> }
  expect(Object.keys(defaultTheme)).toEqual(CHART_THEME_FIELDS.map((f) => f.name))
  for (const f of CHART_THEME_FIELDS) {
    const engine = defaultTheme[f.name]
    const inlined = CHART_THEME_DEFAULT[f.name]
    if (f.kind === 'number') expect(inlined, f.name).toBe(chartDouble(engine as number))
    else expect(inlined, f.name).toEqual(engine)
  }
})

it('the default palette the hosts colour with is the engine DEFAULT_PALETTE', async () => {
  const { DEFAULT_PALETTE } = (await import(join(ENGINE, 'palette.ts'))) as { DEFAULT_PALETTE: string[] }
  expect([...CHART_THEME_DEFAULT.palette]).toEqual(DEFAULT_PALETTE)
})

it('NAMED_PALETTES and CHART_THEMES.dark mirror theme.ts (palettes / chartThemes) exactly', async () => {
  const { chartThemes } = (await import(join(ENGINE, 'theme.ts'))) as { chartThemes: { dark: Record<string, unknown> } }
  const { palettes } = (await import(join(ENGINE, 'palettes.ts'))) as { palettes: Record<string, readonly string[]> }
  expect(Object.keys(NAMED_PALETTES)).toEqual(Object.keys(palettes))
  for (const k of Object.keys(palettes)) expect([...NAMED_PALETTES[k]!], k).toEqual([...palettes[k]!])
  for (const f of CHART_THEME_FIELDS) {
    const engine = chartThemes.dark[f.name]
    const inlined = CHART_THEMES.dark[f.name]
    if (f.kind === 'number') expect(inlined, f.name).toBe(chartDouble(engine as number))
    else if (f.kind === 'strings') expect([...(inlined as readonly string[])], f.name).toEqual(engine)
    else expect(inlined, f.name).toEqual(engine)
  }
})
