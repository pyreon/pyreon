import type { BenchSuite } from './runner'

const statusEl = document.getElementById('status') as HTMLElement
const tableEl = document.getElementById('results') as HTMLElement
const runBtn = document.getElementById('run') as HTMLButtonElement

type Runner = (c: HTMLElement) => Promise<BenchSuite>

/**
 * Each arm is a DYNAMIC import, so a `?framework=<name>` page downloads,
 * evaluates and heap-retains ONLY its own framework + form library. With
 * static imports every page carried all seven runtimes (module-level state,
 * code, JIT feedback), which diluted the retained-heap column into "all seven
 * libraries + a delta" and let other libraries' module-eval side effects run
 * in every column's page.
 */
const ALL: readonly { name: string; load: () => Promise<Runner> }[] = [
  { name: 'Pyreon', load: async () => (await import('./impl/pyreon')).runPyreon },
  { name: 'React Hook Form', load: async () => (await import('./impl/rhf')).runRhf },
  { name: 'TanStack Form', load: async () => (await import('./impl/tanstack')).runTanstack },
  { name: 'Formik', load: async () => (await import('./impl/formik')).runFormik },
  { name: 'Vue (vee-validate)', load: async () => (await import('./impl/vue')).runVue },
  { name: 'Svelte (Felte)', load: async () => (await import('./impl/svelte')).runSvelte },
  { name: 'Solid (modular-forms)', load: async () => (await import('./impl/solid')).runSolid },
]

function fmt(ms: number): string {
  return ms < 1 ? `${(ms * 1000).toFixed(0)} µs` : `${ms.toFixed(2)} ms`
}

function buildTable(suites: BenchSuite[]) {
  if (suites.length === 0) return
  const names = (suites[0] as BenchSuite).results.map((r) => r.name)
  let html = '<table><thead><tr><th>Scenario</th>'
  for (const s of suites) html += `<th>${s.framework}</th>`
  html += '</tr></thead><tbody>'
  for (const name of names) {
    html += `<tr><td class="scenario">${name}</td>`
    for (const s of suites) {
      const r = s.results.find((x) => x.name === name)
      html += r
        ? `<td>${fmt(r.median)}<span class="meta"> cv${(r.cv * 100).toFixed(0)}% · CI[${fmt(r.ci95[0])}–${fmt(r.ci95[1])}]</span></td>`
        : '<td>—</td>'
    }
    html += '</tr>'
  }
  html += '</tbody></table>'
  tableEl.innerHTML = html
}

function makeContainer(): HTMLElement {
  const el = document.createElement('div')
  el.style.cssText = 'position:absolute;left:-9999px;top:0;width:480px;visibility:hidden'
  document.body.appendChild(el)
  return el
}

async function runSelected(
  frameworks: readonly { name: string; load: () => Promise<Runner> }[],
): Promise<BenchSuite[]> {
  runBtn.disabled = true
  tableEl.innerHTML = ''
  const suites: BenchSuite[] = []
  for (const { name, load } of frameworks) {
    statusEl.textContent = `Running ${name}…`
    const container = makeContainer()
    try {
      const run = await load()
      suites.push(await run(container))
    } catch (err) {
      console.error(`${name} benchmark failed:`, err)
    } finally {
      container.remove()
    }
    buildTable(suites)
  }
  statusEl.textContent = 'Done ✓'
  runBtn.disabled = false
  ;(globalThis as { __benchResults?: BenchSuite[] }).__benchResults = suites
  return suites
}

runBtn.addEventListener('click', () => {
  void runSelected(ALL)
})

// `?framework=<name>` — run ONE framework in a fresh page (what bench-form.ts
// uses for per-framework page isolation). `?auto=1` runs all in this page
// (informational only — no isolation).
const url = new URL(window.location.href)
const fw = url.searchParams.get('framework')
if (fw) {
  const entry = ALL.find((f) => f.name === fw)
  if (entry) void runSelected([entry])
  else {
    statusEl.textContent = `Unknown framework: ${fw}`
    console.error(`[form-bench] unknown framework "${fw}". Valid:`, ALL.map((f) => f.name))
  }
} else if (url.searchParams.get('auto') === '1') {
  void runSelected(ALL)
}
