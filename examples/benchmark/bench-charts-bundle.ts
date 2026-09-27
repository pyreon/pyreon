#!/usr/bin/env bun
/**
 * Charts BUNDLE SIZE — `@pyreon/charts` vs ECharts 6, for the same chart,
 * in the same kind of app.
 *
 * Protocol (same as `bench-bundle.ts`):
 *  - one isolated production `vite build` per entry, same vite, same minifier,
 *    same plugins;
 *  - size = SUM of all emitted .js, gzip level 9 (the repo's budget-gate gzip).
 *
 * Every entry is a PYREON app that mounts one chart — the ECharts arms mount a
 * Pyreon component that `init`s ECharts on mount, which is how a Pyreon app
 * uses ECharts. So every entry carries the same framework runtime, and the
 * `runtime only` row is that shared baseline: each library's own cost is its
 * total minus it, printed beside the total. ECharts is imported the documented
 * tree-shaken way (`echarts/core` + only the charts/components used), and also
 * whole (`import * as echarts from 'echarts'`), because that is what a
 * copy-pasted ECharts example imports.
 *
 * HONEST LIMITS: sizes are for these entries, not your app. Measured, not
 * assumed: `PlotChart` does NOT currently tree-shake per mark — a one-line chart
 * costs the same as bar + line + tooltip + legend, because the component pulls
 * its whole interaction surface (tooltip, legend, zoom, brush, toolbox) either
 * way. The `OptionChart` facade compiles every ECharts series type it supports,
 * so it is the larger of the two Pyreon entries. AUTHOR-JUDGE: written by the
 * Pyreon authors.
 *
 * Run: bun bench-charts-bundle.ts
 */
import { execSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const MOUNT = `import { h, onMount } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
`
const LINE_DATA = `const rows = [{ m: 'Jan', v: 3 }, { m: 'Feb', v: 7 }, { m: 'Mar', v: 5 }]`
const OPTION_LINE = `{ xAxis: { type: 'category', data: ['Jan', 'Feb', 'Mar'] }, yAxis: { type: 'value' }, series: [{ type: 'line', data: [3, 7, 5] }] }`
const OPTION_BAR_RICH = `{ tooltip: { trigger: 'axis' }, legend: {}, xAxis: { type: 'category', data: ['Jan', 'Feb', 'Mar'] }, yAxis: { type: 'value' }, series: [{ type: 'bar', name: 'A', data: [3, 7, 5] }, { type: 'line', name: 'B', data: [4, 2, 6] }] }`
const OPTION_PIE = `{ series: [{ type: 'pie', data: [{ name: 'A', value: 3 }, { name: 'B', value: 5 }] }] }`

/** A Pyreon component that hosts an ECharts instance — the idiomatic bridge, written out. */
const echartsHost = (imports: string, use: string, option: string): string => `${MOUNT}${imports}
${use}
function Host() {
  let el: HTMLDivElement | null = null
  onMount(() => {
    const chart = echarts.init(el!, null, { width: 400, height: 300 })
    chart.setOption(${option})
    return () => chart.dispose()
  })
  return h('div', { ref: (e: HTMLDivElement | null) => (el = e) })
}
;(globalThis as Record<string, unknown>).__benchKeep = () => mount(h(Host, null), document.body)
`

interface Entry {
  name: string
  /** The chart a group of entries renders — rows are compared within a group. */
  group: string
  source: string
}

const ENTRIES: Entry[] = [
  {
    name: 'runtime only (shared baseline)',
    group: 'baseline',
    source: `${MOUNT};(globalThis as Record<string, unknown>).__benchKeep = () => mount(h('div', null, 'x'), document.body)\n`,
  },
  {
    name: 'Pyreon PlotChart',
    group: 'line chart',
    source: `${MOUNT}import { line, PlotChart } from '@pyreon/charts/engine'
${LINE_DATA}
;(globalThis as Record<string, unknown>).__benchKeep = () => mount(h(PlotChart, { data: rows, x: (d: { m: string }) => d.m, marks: [line((d: { v: number }) => d.v)] }), document.body)
`,
  },
  {
    name: 'Pyreon OptionChart',
    group: 'line chart',
    source: `${MOUNT}import { OptionChart } from '@pyreon/charts/option'
;(globalThis as Record<string, unknown>).__benchKeep = () => mount(h(OptionChart, { option: ${OPTION_LINE} }), document.body)
`,
  },
  {
    name: 'ECharts 6 (tree-shaken)',
    group: 'line chart',
    source: echartsHost(
      `import * as echarts from 'echarts/core'\nimport { LineChart } from 'echarts/charts'\nimport { GridComponent } from 'echarts/components'\nimport { CanvasRenderer } from 'echarts/renderers'`,
      'echarts.use([LineChart, GridComponent, CanvasRenderer])',
      OPTION_LINE,
    ),
  },
  {
    name: 'ECharts 6 (whole package)',
    group: 'line chart',
    source: echartsHost(`import * as echarts from 'echarts'`, '', OPTION_LINE),
  },
  {
    name: 'Pyreon PlotChart',
    group: 'bar + line, tooltip, legend',
    source: `${MOUNT}import { bars, line, PlotChart } from '@pyreon/charts/engine'
${LINE_DATA}
;(globalThis as Record<string, unknown>).__benchKeep = () => mount(h(PlotChart, { data: rows, x: (d: { m: string }) => d.m, marks: [bars((d: { v: number }) => d.v, { label: 'A' }), line((d: { v: number }) => d.v, { label: 'B' })], tooltip: true, showLegend: true }), document.body)
`,
  },
  {
    name: 'Pyreon OptionChart',
    group: 'bar + line, tooltip, legend',
    source: `${MOUNT}import { OptionChart } from '@pyreon/charts/option'
;(globalThis as Record<string, unknown>).__benchKeep = () => mount(h(OptionChart, { option: ${OPTION_BAR_RICH} }), document.body)
`,
  },
  {
    name: 'ECharts 6 (tree-shaken)',
    group: 'bar + line, tooltip, legend',
    source: echartsHost(
      `import * as echarts from 'echarts/core'\nimport { BarChart, LineChart } from 'echarts/charts'\nimport { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'\nimport { CanvasRenderer } from 'echarts/renderers'`,
      'echarts.use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])',
      OPTION_BAR_RICH,
    ),
  },
  {
    name: 'Pyreon PieChart',
    group: 'pie chart',
    source: `${MOUNT}import { PieChart } from '@pyreon/charts/engine'
;(globalThis as Record<string, unknown>).__benchKeep = () => mount(h(PieChart, { data: [{ label: 'A', value: 3 }, { label: 'B', value: 5 }], label: (d: { label: string }) => d.label, value: (d: { value: number }) => d.value }), document.body)
`,
  },
  {
    name: 'ECharts 6 (tree-shaken)',
    group: 'pie chart',
    source: echartsHost(
      `import * as echarts from 'echarts/core'\nimport { PieChart } from 'echarts/charts'\nimport { CanvasRenderer } from 'echarts/renderers'`,
      'echarts.use([PieChart, CanvasRenderer])',
      OPTION_PIE,
    ),
  },
]

const root = import.meta.dirname
const entriesDir = join(root, 'src/bundle-entries')
mkdirSync(entriesDir, { recursive: true })

function gzSizeOfDir(dir: string): { gz: number; raw: number } {
  let gz = 0
  let raw = 0
  const walk = (d: string): void => {
    for (const f of readdirSync(d)) {
      const p = join(d, f)
      if (statSync(p).isDirectory()) walk(p)
      else if (f.endsWith('.js')) {
        const buf = readFileSync(p)
        gz += gzipSync(buf, { level: 9 }).length
        raw += buf.length
      }
    }
  }
  walk(dir)
  return { gz, raw }
}

const measured: (Entry & { gz: number; raw: number })[] = []
for (const [i, e] of ENTRIES.entries()) {
  const slug = `charts-${i}-${e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const entryFile = join(entriesDir, `${slug}.ts`)
  writeFileSync(entryFile, e.source)
  const outDir = join(root, `dist-bundle/${slug}`)
  rmSync(outDir, { recursive: true, force: true })
  console.log(`[bench-charts-bundle] building ${e.group} — ${e.name}…`)
  execSync(`bunx vite build --outDir ${JSON.stringify(outDir)} --emptyOutDir`, {
    cwd: root,
    stdio: 'pipe',
    env: { ...process.env, NODE_ENV: 'production', BENCH_BUNDLE_ENTRY: entryFile },
  })
  measured.push({ ...e, ...gzSizeOfDir(outDir) })
}

const base = measured.find((m) => m.group === 'baseline')!
const kb = (b: number): string => `${(b / 1024).toFixed(1)} KB`
console.log('\nCharts bundle size — all emitted JS, gzip -9')
console.log(`shared baseline (Pyreon runtime, no chart): ${kb(base.gz)} gz\n`)
for (const group of [...new Set(measured.map((m) => m.group))].filter((g) => g !== 'baseline')) {
  console.log(`  ${group}`)
  console.log('  ' + '─'.repeat(74))
  const rows = measured.filter((m) => m.group === group).sort((a, b) => a.gz - b.gz)
  const best = rows[0]!
  for (const r of rows) {
    const own = r.gz - base.gz
    const ratio = r === best ? '🥇' : `${(own / (best.gz - base.gz)).toFixed(2)}× the chart cost`
    console.log(`  ${r.name.padEnd(28)} ${kb(r.gz).padStart(9)} total   ${kb(own).padStart(9)} chart   ${ratio}`)
  }
  console.log('')
}
