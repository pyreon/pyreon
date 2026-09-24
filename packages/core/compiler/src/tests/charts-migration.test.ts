// `@pyreon/charts` 0.51 → 0.52: the ECharts wrapper was removed. Old imports
// are DETECTED (with the shape to move to), never rewritten — an ECharts
// option has no mechanical translation to marks.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CHARTS_ROOT_NAMES, CHARTS_SVG_NAMES } from '../charts-migration'
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
  // A drifted root table would flag a name the new entry DOES export as part
  // of the removed wrapper — telling a user to rewrite working code.
  it.each([
    ['index.ts', CHARTS_ROOT_NAMES],
    ['svg.ts', CHARTS_SVG_NAMES],
  ] as const)('%s', (file, table) => {
    expect([...table].sort()).toEqual(exportsOf(file))
  })
})

const legacy = (src: string) => detectPyreonPatterns(src).filter((d) => d.code === 'charts-legacy-import')

describe('charts-legacy-import', () => {
  it('flags wrapper-only names from the main entry, naming them', () => {
    const d = legacy(`import { useChart, type EChartsOption } from '@pyreon/charts'\nexport const c = useChart(() => ({}) as EChartsOption)\n`)
    expect(d).toHaveLength(1)
    expect(d[0]!.message).toContain('`useChart`, `EChartsOption` were part of the removed ECharts wrapper')
    expect(d[0]!.fixable).toBe(false)
  })

  it('flags the removed entries', () => {
    const d = legacy(`import { chartsViteAlias } from '@pyreon/charts/vite'\nimport { Chart, use } from '@pyreon/charts/manual'\nimport { ChartWebView } from '@pyreon/charts/webview'\n`)
    expect(d.map((x) => x.message.match(/`(@pyreon\/charts\/\w+)` no longer exists/)?.[1])).toEqual(['@pyreon/charts/vite', '@pyreon/charts/manual', '@pyreon/charts/webview'])
  })

  it('flags the old `<Chart options>` even though `Chart` is still a root name', () => {
    const d = legacy(`import { Chart } from '@pyreon/charts'\nexport const A = () => <Chart options={() => ({})} style="height: 300px" />\n`)
    expect(d).toHaveLength(1)
    expect(d[0]!.message).toContain('`<Chart options>` is the removed ECharts wrapper')
  })

  it('leaves the grammar <Chart> alone', () => {
    const src = `import { Chart, Bar, Tooltip, visualMap } from '@pyreon/charts'\nexport const A = () => <Chart data={[]} x="m"><Bar y="v" /><Tooltip /></Chart>\n`
    expect(legacy(src)).toEqual([])
  })

  it('is never rewritten — there is no mechanical translation', () => {
    const src = `import { useChart } from '@pyreon/charts'\nexport const c = useChart(() => ({}))\n`
    expect(migratePyreonCode(src, 'app.tsx').code).toBe(src)
  })
})

describe('diagnose teaches the removal', () => {
  it.each([
    ['Missing "./vite" specifier in "@pyreon/charts" package', '`@pyreon/charts/vite` no longer exists'],
    [`Module '"@pyreon/charts"' has no exported member 'useChart'.`, '`useChart` belonged to the wrapper'],
    [`Module '"@pyreon/charts"' has no exported member 'LineSeriesOption'.`, '`LineSeriesOption` belonged to the wrapper'],
  ])('%s', (message, cause) => {
    const d = diagnoseError(message)
    expect(d?.cause).toContain(cause)
    expect(d?.fix).toContain('<Bar y=')
  })
})
