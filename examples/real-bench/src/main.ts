import { createPyreonApp } from './impl/pyreon'
import { createReactApp } from './impl/react'
import { runFramework, type FrameworkResult } from './runner'
import { SCENARIOS } from './scenarios'
import { ci95Overlaps, fmtMs, type Stats } from './stats'
import type { AppFactory } from './types'

const FRAMEWORKS: Record<string, AppFactory> = {
  pyreon: createPyreonApp,
  react: createReactApp,
}

declare global {
  interface Window {
    __REAL_BENCH__?: FrameworkResult
  }
}

const params = new URLSearchParams(location.search)
const requested = params.get('framework')
const runs = Number(params.get('runs') ?? '20')

const statusEl = document.getElementById('status')!
const appEl = document.getElementById('app') as HTMLElement
const resultsEl = document.getElementById('results')!

function setStatus(msg: string): void {
  statusEl.textContent = msg
}

async function main(): Promise<void> {
  // Per-framework page isolation: Playwright loads `?framework=<name>` in a
  // fresh page per framework, so this branch runs ONE framework's full
  // scenario set with no cross-framework heap/JIT bias.
  if (requested && FRAMEWORKS[requested]) {
    setStatus(`running ${requested}…`)
    const result = await runFramework(FRAMEWORKS[requested]!, SCENARIOS, appEl, runs, (m) =>
      setStatus(`running ${m}…`),
    )
    window.__REAL_BENCH__ = result
    renderTable([result])
    setStatus(`done: ${requested}`)
    return
  }

  // Manual / no-param load: run every framework in one page (informational —
  // the authoritative numbers come from the page-isolated Playwright runner).
  setStatus('running all frameworks (manual mode)…')
  const results: FrameworkResult[] = []
  for (const factory of Object.values(FRAMEWORKS)) {
    results.push(
      await runFramework(factory, SCENARIOS, appEl, runs, (m) => setStatus(`running ${m}…`)),
    )
    appEl.replaceChildren()
  }
  renderTable(results)
  setStatus('done (manual mode)')
}

function renderTable(results: FrameworkResult[]): void {
  const cell = (s: Stats): string =>
    `${fmtMs(s.median)} <small>(cv ${(s.cv * 100).toFixed(0)}%)</small>`

  let html = '<table><thead><tr><th>scenario</th>'
  for (const r of results) html += `<th>${r.framework}</th>`
  html += '<th>read</th></tr></thead><tbody>'

  for (const scenario of SCENARIOS) {
    html += `<tr><td>${scenario.name}</td>`
    const statsByFw = results.map((r) => r.scenarios[scenario.name]).filter(Boolean) as Stats[]
    const leader = statsByFw.reduce((a, b) => (a.median <= b.median ? a : b), statsByFw[0]!)
    for (const r of results) {
      const s = r.scenarios[scenario.name]
      html += `<td>${s ? cell(s) : '—'}</td>`
    }
    // 🤝 = within-noise tie with the leader (CI95 overlap).
    const ties = results
      .filter((r) => r.scenarios[scenario.name] && r.scenarios[scenario.name] !== leader)
      .filter((r) => ci95Overlaps(r.scenarios[scenario.name]!, leader))
      .map((r) => r.framework)
    html += `<td>${ties.length ? `🤝 ${ties.join(', ')}` : ''}</td></tr>`
  }
  html += '</tbody></table>'
  resultsEl.innerHTML = html
}

void main()
