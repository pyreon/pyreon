import { runPreact } from './impl/preact'
import { runPyreon } from './impl/pyreon'
import { runPyreonTpl } from './impl/pyreon-tpl'
import { runReact } from './impl/react'
import { runSolid } from './impl/solid'
import { runSvelte } from './impl/svelte'
import { runVanilla } from './impl/vanilla'
import { runVue } from './impl/vue'
import type { BenchSuite } from './runner'

// ─── UI helpers ───────────────────────────────────────────────────────────────

const statusEl = document.getElementById('status') as HTMLElement
const tableEl = document.getElementById('results') as HTMLElement
const runBtn = document.getElementById('run') as HTMLButtonElement

function setStatus(msg: string) {
  statusEl.textContent = msg
}

function fmt(ms: number): string {
  return ms < 1 ? `${(ms * 1000).toFixed(0)} µs` : `${ms.toFixed(1)} ms`
}

function score(ms: number): string {
  // Lower is better. Colour code: green < 16ms, yellow < 100ms, red ≥ 100ms
  const cls = ms < 16 ? 'fast' : ms < 100 ? 'ok' : 'slow'
  return `<span class="${cls}">${fmt(ms)}</span>`
}

function ratioCell(median: number, best: number): string {
  const ratio = median / best
  const cls = ratio < 1.5 ? 'fast' : ratio < 3 ? 'ok' : 'slow'
  return `<td><span class="${cls}">${ratio.toFixed(2)}×</span></td>`
}

function buildSlowdownRow(name: string, subset: BenchSuite[], best: number): string {
  let row = `<tr><td class="test-name">${name}</td>`
  for (const suite of subset) {
    const r = suite.results.find((x) => x.name === name)
    row += r ? ratioCell(r.median, best) : '<td>—</td>'
  }
  row += '</tr>'
  return row
}

function bestMedian(name: string, subset: BenchSuite[]): number {
  const medians = subset.map(
    (s) => s.results.find((x) => x.name === name)?.median ?? Number.POSITIVE_INFINITY,
  )
  return Math.min(...medians)
}

function buildSlowdownTable(label: string, subset: BenchSuite[], testNames: string[]): string {
  let t = `<p class="note">${label} (lower = better, 1.00× = fastest)</p>`
  t += '<table><thead><tr><th>Test</th>'
  for (const s of subset) {
    t += `<th>${s.framework}</th>`
  }
  t += '</tr></thead><tbody>'
  for (const name of testNames) {
    t += buildSlowdownRow(name, subset, bestMedian(name, subset))
  }
  t += '</tbody></table>'
  return t
}

function buildTable(suites: BenchSuite[]) {
  if (suites.length === 0) return

  // Collect all unique test names in order
  const testNames = (suites[0] as BenchSuite).results.map((r) => r.name)

  // Header
  let html = `<table><thead><tr><th>Test</th>`
  for (const s of suites) html += `<th>${s.framework}</th>`
  html += `</tr></thead><tbody>`

  for (const name of testNames) {
    html += `<tr><td class="test-name">${name}</td>`
    for (const suite of suites) {
      const r = suite.results.find((x) => x.name === name)
      html += r
        ? `<td>${score(r.median)}<span class="stddev"> p90 ${fmt(r.p90)}</span></td>`
        : `<td>—</td>`
    }
    html += `</tr>`
  }

  html += `</tbody></table>`

  // Slowdown ratio tables
  if (suites.length > 1) {
    html += buildSlowdownTable('Slowdown vs best (all)', suites, testNames)

    // Framework-only comparison (excludes vanilla raw DOM baseline)
    const frameworkOnly = suites.filter((s) => s.framework !== 'Vanilla JS')
    if (frameworkOnly.length > 1) {
      html += buildSlowdownTable('Slowdown vs best framework', frameworkOnly, testNames)
    }
  }

  tableEl.innerHTML = html
}

// ─── Isolated containers ──────────────────────────────────────────────────────

function makeContainer(): HTMLElement {
  const el = document.createElement('div')
  el.style.cssText = 'position:absolute;left:-9999px;top:0;width:800px;visibility:hidden'
  document.body.appendChild(el)
  return el
}

function removeContainer(el: HTMLElement) {
  el.remove()
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const ALL_FRAMEWORKS = [
  { name: 'Vanilla JS', run: runVanilla },
  { name: 'Preact', run: runPreact },
  { name: 'React 19', run: runReact },
  { name: 'Vue 3', run: runVue },
  { name: 'SolidJS', run: runSolid },
  { name: 'Svelte 5', run: runSvelte },
  { name: 'Pyreon', run: runPyreon },
  { name: 'Pyreon (compiled)', run: runPyreonTpl },
] as const

async function runSelected(
  frameworks:
    | typeof ALL_FRAMEWORKS
    | { name: string; run: (typeof ALL_FRAMEWORKS)[number]['run'] }[],
): Promise<BenchSuite[]> {
  runBtn.disabled = true
  tableEl.innerHTML = ''
  const suites: BenchSuite[] = []

  for (const { name, run } of frameworks) {
    setStatus(`Running ${name}…`)
    const container = makeContainer()
    try {
      const suite = await run(container)
      suites.push(suite)
    } catch (err) {
      console.error(`${name} benchmark failed:`, err)
    } finally {
      removeContainer(container)
    }
    buildTable(suites)
  }

  setStatus('Done ✓')
  runBtn.disabled = false
  // Expose to Playwright runner / external harnesses.
  ;(globalThis as { __benchResults?: BenchSuite[] }).__benchResults = suites
  return suites
}

async function runAll(): Promise<BenchSuite[]> {
  // In-browser button-driven flow — shuffle order so a curious user
  // doesn't see consistent first-run GC pressure on the same framework.
  // The fair-bench Playwright runner uses ?framework=<name> to get
  // ONE framework per fresh page-load, which is strictly more
  // objective than even a shuffled all-in-one-page run.
  const shuffled = [...ALL_FRAMEWORKS]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = shuffled[i]
    const b = shuffled[j]
    if (a && b) {
      shuffled[i] = b
      shuffled[j] = a
    }
  }
  return runSelected(shuffled)
}

runBtn.addEventListener('click', () => {
  void runAll()
})

// URL-flag driven entry points:
//
//   ?framework=<name>   Run ONLY that framework, then set status to
//                       Done. Fresh page-load per framework means
//                       zero cross-suite memory pressure / heap bias.
//                       This is what `bench-fair.ts` uses now.
//
//   ?auto=1             Run all 8 frameworks in this page (legacy
//                       in-page flow). Retained for the button UI
//                       and for backwards compatibility — but the
//                       fair-bench runner has switched to
//                       per-framework page isolation.
const __url = new URL(window.location.href)
const __frameworkParam = __url.searchParams.get('framework')
if (__frameworkParam) {
  const entry = ALL_FRAMEWORKS.find((f) => f.name === __frameworkParam)
  if (entry) {
    void runSelected([entry])
  } else {
    setStatus(`Unknown framework: ${__frameworkParam}`)
    console.error(
      `[bench] unknown framework "${__frameworkParam}". Valid:`,
      ALL_FRAMEWORKS.map((f) => f.name),
    )
  }
} else if (__url.searchParams.get('auto') === '1') {
  void runAll()
}
