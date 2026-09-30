#!/usr/bin/env bun
/**
 * Charts BUNDLE SIZE — `@pyreon/charts` vs uPlot, Chart.js and Recharts: the
 * minimal import each library needs to draw ONE line chart.
 *
 * Protocol (same as `bench-bundle.ts` / `bench-charts-bundle.ts`):
 *  - one isolated production `vite build` per entry — same vite, minifier and
 *    plugin set for every entry, `NODE_ENV=production`;
 *  - size = SUM of all emitted .js, gzip level 9. Emitted CSS is reported in
 *    its own column (uPlot ships a stylesheet its layout relies on).
 *
 * Each library is measured in the host it actually needs:
 *  - uPlot and Chart.js are framework-free, so their entries are plain
 *    scripts — the number IS the library.
 *  - Recharts is React-only, so its entry mounts with React 19 + ReactDOM;
 *    a `React + ReactDOM only` row is the baseline it sits on.
 *  - Pyreon's charts need the Pyreon runtime; a `Pyreon runtime only` row is
 *    that baseline.
 * The table prints each entry's TOTAL (what a new page ships) and its OWN
 * cost over its baseline (what adding the chart to an app that already has
 * the framework costs). Both are honest; they answer different questions.
 *
 * Chart.js is imported tree-shaken, the documented way (`register` only what a
 * linear-x line chart needs). uPlot has no sub-module split.
 *
 * HONEST LIMITS: sizes are for these entries, not your app. A bundle size is
 * not a runtime cost. AUTHOR-JUDGE: written by the Pyreon authors.
 *
 * Run: bun bench-charts-libs-bundle.ts
 */
import { execSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const KEEP = `(globalThis as Record<string, unknown>).__benchKeep`
const PYREON = `import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
`
const REACT = `import { createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
`

interface Entry {
  name: string
  /** Name of the baseline row this entry's OWN cost is measured against. */
  base: string | null
  source: string
  /** A string that MUST appear in the emitted JS, proving the library was bundled. */
  marker: string
}

const ENTRIES: Entry[] = [
  {
    name: 'Pyreon runtime only',
    base: null,
    source: `${PYREON};${KEEP} = () => mount(h('div', null, 'x'), document.body)\n`,
    marker: '',
  },
  {
    name: 'React + ReactDOM only',
    base: null,
    source: `${REACT};${KEEP} = () => createRoot(document.body).render(h('div', null, 'x'))\n`,
    marker: '',
  },
  {
    name: 'Pyreon <PlotChart> + line()',
    base: 'Pyreon runtime only',
    source: `${PYREON}import { line, PlotChart } from '@pyreon/charts/engine'
const rows = [{ v: 3 }, { v: 7 }, { v: 5 }]
;${KEEP} = () => mount(h(PlotChart, { data: rows, marks: [line((d: { v: number }) => d.v)], width: 800, height: 300 }), document.body)
`,
    marker: 'getContext',
  },
  {
    name: 'Pyreon <Chart><Line/> (stable entry)',
    base: 'Pyreon runtime only',
    source: `${PYREON}import { Chart, Line } from '@pyreon/charts'
const rows = [{ i: 0, v: 3 }, { i: 1, v: 7 }, { i: 2, v: 5 }]
;${KEEP} = () => mount(h(Chart, { data: rows, width: 800, height: 300 }, h(Line, { y: 'v' })), document.body)
`,
    marker: 'getContext',
  },
  {
    name: 'uPlot 1.6.32',
    base: null,
    source: `import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
;${KEEP} = () => new uPlot({ width: 800, height: 300, scales: { x: { time: false } }, series: [{}, { stroke: 'blue' }] }, [[0, 1, 2], [3, 7, 5]], document.body)
`,
    marker: 'getContext',
  },
  {
    name: 'Chart.js 4.5.1 (tree-shaken)',
    base: null,
    source: `import { Chart, LinearScale, LineController, LineElement, PointElement } from 'chart.js'
Chart.register(LineController, LineElement, PointElement, LinearScale)
;${KEEP} = () => new Chart(document.createElement('canvas'), { type: 'line', data: { datasets: [{ data: [{ x: 0, y: 3 }, { x: 1, y: 7 }, { x: 2, y: 5 }] }] }, options: { scales: { x: { type: 'linear' } } } })
`,
    marker: 'getContext',
  },
  {
    name: 'Recharts 3.10.1',
    base: 'React + ReactDOM only',
    source: `${REACT}import { Line, LineChart, XAxis, YAxis } from 'recharts'
const rows = [{ x: 0, y: 3 }, { x: 1, y: 7 }, { x: 2, y: 5 }]
;${KEEP} = () => createRoot(document.body).render(h(LineChart, { width: 800, height: 300, data: rows }, h(XAxis, { dataKey: 'x', type: 'number' }), h(YAxis, null), h(Line, { dataKey: 'y' })))
`,
    marker: 'recharts',
  },
]

const root = import.meta.dirname
const entriesDir = join(root, 'src/bundle-entries')
mkdirSync(entriesDir, { recursive: true })

function sizeOfDir(dir: string): { js: number; css: number; text: string } {
  let js = 0
  let css = 0
  let text = ''
  const walk = (d: string): void => {
    for (const f of readdirSync(d)) {
      const p = join(d, f)
      if (statSync(p).isDirectory()) walk(p)
      else if (f.endsWith('.js')) {
        const buf = readFileSync(p)
        js += gzipSync(buf, { level: 9 }).length
        text += buf.toString('utf8')
      } else if (f.endsWith('.css')) css += gzipSync(readFileSync(p), { level: 9 }).length
    }
  }
  walk(dir)
  return { js, css, text }
}

const measured = new Map<string, { js: number; css: number }>()
for (const [i, e] of ENTRIES.entries()) {
  const slug = `chartslibs-${i}-${e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const entryFile = join(entriesDir, `${slug}.ts`)
  writeFileSync(entryFile, e.source)
  const outDir = join(root, `dist-bundle/${slug}`)
  rmSync(outDir, { recursive: true, force: true })
  console.log(`[bench-charts-libs-bundle] building ${e.name}…`)
  execSync(`bunx vite build --outDir ${JSON.stringify(outDir)} --emptyOutDir`, {
    cwd: root,
    stdio: 'pipe',
    env: { ...process.env, NODE_ENV: 'production', BENCH_BUNDLE_ENTRY: entryFile },
  })
  const s = sizeOfDir(outDir)
  // Gate: an entry that tree-shook its library away would post a tiny,
  // meaningless number. Require a string only the real library emits.
  if (e.marker !== '' && !s.text.includes(e.marker)) {
    throw new Error(`[bench-charts-libs-bundle] ${e.name}: marker ${JSON.stringify(e.marker)} missing — library not bundled`)
  }
  measured.set(e.name, { js: s.js, css: s.css })
}

const kb = (b: number): string => `${(b / 1024).toFixed(1)} KB`
console.log('\nMinimal line chart — emitted JS gzip -9 (CSS separate)\n')
console.log(`  ${'entry'.padEnd(40)} ${'total JS'.padStart(9)} ${'own JS'.padStart(9)} ${'CSS'.padStart(8)}   baseline`)
console.log('  ' + '─'.repeat(92))
for (const e of ENTRIES) {
  const m = measured.get(e.name)!
  const base = e.base === null ? null : measured.get(e.base)!
  const own = base === null ? m.js : m.js - base.js
  console.log(
    `  ${e.name.padEnd(40)} ${kb(m.js).padStart(9)} ${kb(own).padStart(9)} ${kb(m.css).padStart(8)}   ${e.base ?? '—'}`,
  )
}
console.log('\n  JSON:', JSON.stringify(Object.fromEntries(measured)))
