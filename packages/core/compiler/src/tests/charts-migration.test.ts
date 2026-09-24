// The `@pyreon/charts` entry-point migration: `pyreon check --fix` / MCP
// `migrate_pyreon` rewrite old imports and renames mechanically.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CHARTS_ECHARTS_NAMES, CHARTS_OPTION_NAMES, CHARTS_ROOT_NAMES, CHARTS_SVG_NAMES } from '../charts-migration'
import { detectPyreonPatterns } from '../pyreon-intercept'
import { migratePyreonCode } from '../pyreon-migrate'
import { diagnoseError } from '../diagnose'

const CHARTS_SRC = join(dirname(fileURLToPath(import.meta.url)), '../../../../fundamentals/charts/src')

/** Every name an entry file exports, comments stripped. */
function exportsOf(file: string): string[] {
  const src = readFileSync(join(CHARTS_SRC, file), 'utf8').replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  const out = new Set<string>()
  for (const m of src.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (let part of m[1]!.split(',')) {
      part = part.trim().replace(/^type\s+/, '')
      if (part === '') continue
      out.add(part.includes(' as ') ? part.split(' as ')[1]!.trim() : part)
    }
  }
  return [...out].sort()
}

describe('the name tables match the charts package', () => {
  // A table that drifts from the package routes a name to an entry that no
  // longer exports it, and the "fixed" import fails to resolve.
  it.each([
    ['index.ts', CHARTS_ROOT_NAMES],
    ['option.ts', CHARTS_OPTION_NAMES],
    ['svg.ts', CHARTS_SVG_NAMES],
    ['echarts.ts', CHARTS_ECHARTS_NAMES],
  ] as const)('%s', (file, table) => {
    expect([...table].sort()).toEqual(exportsOf(file))
  })
})

const fix = (src: string): string => migratePyreonCode(src, 'app.tsx').code

describe('charts-legacy-import', () => {
  it('moves the old ECharts wrapper to /echarts and renames Chart → EChart everywhere', () => {
    const src = `import { Chart, useChart, type EChartsOption } from '@pyreon/charts'
const opts: EChartsOption = {}
export const A = () => <Chart options={() => opts} style="height: 300px" />
export const B = () => { const c = useChart(() => opts); return <div ref={c.ref} /> }
`
    const out = fix(src)
    expect(out).toContain(`import { EChart, useChart, type EChartsOption } from '@pyreon/charts/echarts'`)
    expect(out).toContain('<EChart options={() => opts}')
    expect(out).not.toMatch(/<Chart\b/)
  })

  it('routes every /plot name to its new entry and renames Plot / Tip', () => {
    const src = `import { Plot, Bar, Tip, OptionChart, chartToSvg, PlotChart, bars, type PlotProps } from '@pyreon/charts/plot'
type P = PlotProps<{ v: number }>
export const A = () => <Plot data={[]}><Bar y="v" /><Tip /></Plot>
export const S = chartToSvg
export const O = OptionChart
export const R = () => <PlotChart data={[]} marks={[bars(() => 1)]} />
`
    const out = fix(src)
    expect(out).toContain(`import { Chart, Bar, Tooltip, type ChartProps } from '@pyreon/charts'`)
    expect(out).toContain(`import { OptionChart } from '@pyreon/charts/option'`)
    expect(out).toContain(`import { chartToSvg } from '@pyreon/charts/svg'`)
    expect(out).toContain(`import { PlotChart, bars } from '@pyreon/charts/engine'`)
    expect(out).toContain('<Chart data={[]}><Bar y="v" /><Tooltip /></Chart>')
    expect(out).toContain('type P = ChartProps<{ v: number }>')
  })

  it('moves /manual and /vite under /echarts', () => {
    const out = fix(`import { Chart, use } from '@pyreon/charts/manual'\nimport { chartsViteAlias } from '@pyreon/charts/vite'\nexport const A = () => <Chart options={() => ({})} />\n`)
    expect(out).toContain(`import { EChart, use } from '@pyreon/charts/echarts/manual'`)
    expect(out).toContain(`import { chartsViteAlias } from '@pyreon/charts/echarts/vite'`)
    expect(out).toContain('<EChart options=')
  })

  it('leaves new-style code alone — the grammar <Chart> is not the ECharts one', () => {
    const src = `import { Chart, Bar, Tooltip } from '@pyreon/charts'\nexport const A = () => <Chart data={[]} x="m"><Bar y="v" /><Tooltip /></Chart>\n`
    expect(fix(src)).toBe(src)
    expect(detectPyreonPatterns(src).filter((d) => d.code === 'charts-legacy-import')).toEqual([])
  })

  it('keeps an alias, renaming only the imported side', () => {
    const out = fix(`import { Plot as P } from '@pyreon/charts/plot'\nexport const A = () => <P data={[]} />\n`)
    expect(out).toContain(`import { Chart as P } from '@pyreon/charts'`)
    expect(out).toContain('<P data={[]} />')
  })

  it('is reported as fixable, and fixing is idempotent', () => {
    const src = `import { Plot } from '@pyreon/charts/plot'\nexport const A = () => <Plot data={[]} />\n`
    const d = detectPyreonPatterns(src).filter((x) => x.code === 'charts-legacy-import')
    expect(d).toHaveLength(1)
    expect(d[0]!.fixable).toBe(true)
    const once = fix(src)
    expect(fix(once)).toBe(once)
  })
})

describe('diagnose teaches the move', () => {
  it.each([
    ['Missing "./plot" specifier in "@pyreon/charts" package', '`@pyreon/charts/plot` no longer exists'],
    [`Module '"@pyreon/charts"' has no exported member 'useChart'.`, '`useChart` no longer comes from'],
  ])('%s', (message, cause) => {
    const d = diagnoseError(message)
    expect(d?.cause).toContain(cause)
    expect(d?.fix).toContain('pyreon check --fix')
  })
})
