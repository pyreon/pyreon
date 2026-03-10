import { runPreact } from "./impl/preact"
import { runPyreon } from "./impl/pyreon"
import { runReact } from "./impl/react"
import { runSolid } from "./impl/solid"
import { runVanilla } from "./impl/vanilla"
import { runVue } from "./impl/vue"
import type { BenchSuite } from "./runner"

// ─── UI helpers ───────────────────────────────────────────────────────────────

const statusEl = document.getElementById("status")!
const tableEl = document.getElementById("results")!
const runBtn = document.getElementById("run") as HTMLButtonElement

function setStatus(msg: string) {
  statusEl.textContent = msg
}

function fmt(ms: number): string {
  return ms < 1 ? `${(ms * 1000).toFixed(0)} µs` : `${ms.toFixed(1)} ms`
}

function score(ms: number): string {
  // Lower is better. Colour code: green < 16ms, yellow < 100ms, red ≥ 100ms
  const cls = ms < 16 ? "fast" : ms < 100 ? "ok" : "slow"
  return `<span class="${cls}">${fmt(ms)}</span>`
}

function buildTable(suites: BenchSuite[]) {
  if (suites.length === 0) return

  // Collect all unique test names in order
  const testNames = suites[0]!.results.map((r) => r.name)

  // Header
  let html = `<table><thead><tr><th>Test</th>`
  for (const s of suites) html += `<th>${s.framework}</th>`
  html += `</tr></thead><tbody>`

  for (const name of testNames) {
    html += `<tr><td class="test-name">${name}</td>`
    for (const suite of suites) {
      const r = suite.results.find((x) => x.name === name)
      html += r
        ? `<td>${score(r.mean)}<span class="stddev"> ±${fmt(r.stddev)}</span></td>`
        : `<td>—</td>`
    }
    html += `</tr>`
  }

  html += `</tbody></table>`

  // Slowdown ratio tables
  if (suites.length > 1) {
    const buildSlowdownTable = (label: string, subset: BenchSuite[]): string => {
      let t = `<p class="note">${label} (lower = better, 1.00\u00d7 = fastest)</p>`
      t += "<table><thead><tr><th>Test</th>"
      for (const s of subset) {
        t += `<th>${s.framework}</th>`
      }
      t += "</tr></thead><tbody>"
      for (const name of testNames) {
        const means = subset.map(
          (s) => s.results.find((x) => x.name === name)?.mean ?? Number.POSITIVE_INFINITY,
        )
        const best = Math.min(...means)
        t += `<tr><td class="test-name">${name}</td>`
        for (const suite of subset) {
          const r = suite.results.find((x) => x.name === name)
          if (r) {
            const ratio = r.mean / best
            const cls = ratio < 1.5 ? "fast" : ratio < 3 ? "ok" : "slow"
            t += `<td><span class="${cls}">${ratio.toFixed(2)}\u00d7</span></td>`
          } else {
            t += "<td>\u2014</td>"
          }
        }
        t += "</tr>"
      }
      t += "</tbody></table>"
      return t
    }

    html += buildSlowdownTable("Slowdown vs best (all)", suites)

    // Framework-only comparison (excludes vanilla raw DOM baseline)
    const frameworkOnly = suites.filter((s) => s.framework !== "Vanilla JS")
    if (frameworkOnly.length > 1) {
      html += buildSlowdownTable("Slowdown vs best framework", frameworkOnly)
    }
  }

  tableEl.innerHTML = html
}

// ─── Isolated containers ──────────────────────────────────────────────────────

function makeContainer(): HTMLElement {
  const el = document.createElement("div")
  el.style.cssText = "position:absolute;left:-9999px;top:0;width:800px;visibility:hidden"
  document.body.appendChild(el)
  return el
}

function removeContainer(el: HTMLElement) {
  el.remove()
}

// ─── Main ─────────────────────────────────────────────────────────────────────

runBtn.addEventListener("click", async () => {
  runBtn.disabled = true
  tableEl.innerHTML = ""

  const suites: BenchSuite[] = []

  const frameworks = [
    { name: "Vanilla JS", run: runVanilla },
    { name: "Preact", run: runPreact },
    { name: "React 19", run: runReact },
    { name: "Vue 3", run: runVue },
    { name: "SolidJS", run: runSolid },
    { name: "Pyreon", run: runPyreon },
  ]

  // Randomize execution order to avoid GC pressure bias
  for (let i = frameworks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = frameworks[i]
    const b = frameworks[j]
    if (a && b) {
      frameworks[i] = b
      frameworks[j] = a
    }
  }

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
    // Partial update after each suite
    buildTable(suites)
  }

  setStatus("Done ✓")
  runBtn.disabled = false
})
