import { runVanilla } from "./impl/vanilla"
import { runReact } from "./impl/react"
import { runVue } from "./impl/vue"
import { runNova } from "./impl/nova"
import { runPreact } from "./impl/preact"
import { runSolid } from "./impl/solid"
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

  // Slowdown ratios vs Vanilla
  const vanillaSuite = suites.find((s) => s.framework === "Vanilla JS")
  if (vanillaSuite && suites.length > 1) {
    html += `<p class="note">Slowdown vs Vanilla JS (lower = better, 1.0x = same speed)</p>`
    html += `<table><thead><tr><th>Test</th>`
    for (const s of suites.filter((s) => s.framework !== "Vanilla JS")) {
      html += `<th>${s.framework} / Vanilla</th>`
    }
    html += `</tr></thead><tbody>`
    for (const name of testNames) {
      const base = vanillaSuite.results.find((x) => x.name === name)?.mean ?? 1
      html += `<tr><td class="test-name">${name}</td>`
      for (const suite of suites.filter((s) => s.framework !== "Vanilla JS")) {
        const r = suite.results.find((x) => x.name === name)
        if (r) {
          const ratio = r.mean / base
          const cls = ratio < 1.5 ? "fast" : ratio < 3 ? "ok" : "slow"
          html += `<td><span class="${cls}">${ratio.toFixed(2)}×</span></td>`
        } else {
          html += `<td>—</td>`
        }
      }
      html += `</tr>`
    }
    html += `</tbody></table>`
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
    { name: "Nova", run: runNova },
  ]

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
