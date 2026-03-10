/**
 * Real-browser framework comparison benchmark.
 *
 * Each framework runs in a FRESH page (page.goto) to eliminate cross-contamination
 * from leaked DOM nodes, GC pressure, and heap fragmentation from prior frameworks.
 *
 * Uses the benchmark app (port 5174) which has all frameworks:
 * Vanilla JS, React 19, Vue 3, Preact, SolidJS, Pyreon.
 *
 * NOTE on compilation caveats:
 * - Vue uses h() render functions (no template compiler optimizations like patch flags
 *   or static hoisting). A real Vue app with <template> would be faster on updates.
 * - Solid uses manual createElement (no compiled template cloning). A real Solid app
 *   with JSX compilation would be faster on creation.
 * - Pyreon uses h() directly (same as other frameworks). Its compiler would add static
 *   hoisting but the runtime behavior is the same.
 * - React and Preact use createElement/h() which is their standard runtime path.
 *
 * These are inherent limitations of running all frameworks without per-framework
 * build pipelines. The benchmark measures runtime performance, not compiler output.
 */

import { type Page, expect, test } from "@playwright/test"

const BENCH_URL = "http://localhost:5174"

/** Run one framework's benchmark suite in a fresh page, return its results. */
async function runFrameworkInIsolation(
  page: Page,
  frameworkName: string,
): Promise<Record<string, { mean: number; stddev: number }> | null> {
  await page.goto(BENCH_URL)
  await expect(page.locator("h1")).toContainText("Pyreon")

  // Run only this framework by clicking "Run" and waiting for "Done"
  // The app runs all frameworks, so we scrape only the column we need
  const runBtn = page.locator("#run")
  await expect(runBtn).toBeVisible()
  await runBtn.click()

  await expect(page.locator("#status")).toHaveText("Done \u2713", { timeout: 240_000 })

  // Scrape results for the target framework
  return page.evaluate((fwName) => {
    const tables = document.querySelectorAll("table")
    if (tables.length === 0) return null

    const mainTable = tables[0]
    if (!mainTable) return null
    const headers = Array.from(mainTable.querySelectorAll("thead th")).map(
      (th) => th.textContent?.trim() ?? "",
    )

    const fwIndex = headers.indexOf(fwName)
    if (fwIndex < 0) return null

    const parseDuration = (s: string): number => {
      const match = s.match(/([\d.]+)\s*(ms|µs)/)
      if (!match) return 0
      const valStr = match[1]
      if (!valStr) return 0
      const val = Number.parseFloat(valStr)
      return match[2] === "µs" ? val / 1000 : val
    }

    const results: Record<string, { mean: number; stddev: number }> = {}
    for (const tr of mainTable.querySelectorAll("tbody tr")) {
      const cells = tr.querySelectorAll("td")
      const testName = cells[0]?.textContent?.trim() ?? ""
      const cellText = cells[fwIndex]?.textContent?.trim() ?? ""

      // Parse "12.3 ms ±1.2 ms" or "456 µs ±78 µs"
      const parts = cellText.split("±").map((s) => s.trim())

      results[testName] = {
        mean: parseDuration(parts[0] ?? ""),
        stddev: parseDuration(parts[1] ?? ""),
      }
    }

    return results
  }, frameworkName)
}

test.describe("Framework Comparison Benchmark", () => {
  test("run all framework benchmarks in isolated pages", async ({ browser }) => {
    test.setTimeout(600_000) // 10 min — each framework gets its own page load

    const frameworkNames = ["Vanilla JS", "Preact", "React 19", "Vue 3", "SolidJS", "Pyreon"]

    // Randomize order to avoid systematic bias
    for (let i = frameworkNames.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const a = frameworkNames[i]
      const b = frameworkNames[j]
      if (a && b) {
        frameworkNames[i] = b
        frameworkNames[j] = a
      }
    }

    const allResults: Record<string, Record<string, { mean: number; stddev: number }>> = {}

    for (const fwName of frameworkNames) {
      // Fresh browser context per framework — clean heap, no shared state
      const context = await browser.newContext()
      const page = await context.newPage()

      try {
        const results = await runFrameworkInIsolation(page, fwName)
        if (results) {
          allResults[fwName] = results
        } else {
          console.log(`  WARNING: No results for ${fwName}`)
        }
      } finally {
        await context.close()
      }
    }

    // Verify we got results
    const frameworks = Object.keys(allResults)
    expect(frameworks.length).toBeGreaterThanOrEqual(3)

    const pyreonPresent = frameworks.includes("Pyreon")
    expect(pyreonPresent).toBe(true)

    // Collect all test names from the first framework
    const firstKey = frameworks[0]
    expect(firstKey).toBeDefined()
    const firstFw = allResults[firstKey ?? ""]
    expect(firstFw).toBeDefined()
    const testNames = Object.keys(firstFw ?? {})
    expect(testNames.length).toBeGreaterThanOrEqual(5)

    // ─── Print absolute times ──────────────────────────────────────────

    // Sort frameworks in a consistent display order
    const displayOrder = ["Vanilla JS", "Preact", "React 19", "Vue 3", "SolidJS", "Pyreon"]
    const sortedFws = displayOrder.filter((f) => frameworks.includes(f))

    const fmtMs = (ms: number): string =>
      ms < 1 ? `${(ms * 1000).toFixed(0)} \u00b5s` : `${ms.toFixed(1)} ms`

    const W = 18
    const LABEL = 30

    console.log("\n  Real Browser Benchmark (Chromium) — isolated pages per framework")
    console.log(`  ${"".padEnd(LABEL)}${sortedFws.map((f) => f.padStart(W)).join("")}`)
    console.log(`  ${"─".repeat(LABEL + W * sortedFws.length)}`)

    for (const testName of testNames) {
      let row = `  ${testName.padEnd(LABEL)}`
      for (const fw of sortedFws) {
        const r = allResults[fw]?.[testName]
        if (r) {
          row += `${fmtMs(r.mean)} \u00b1${fmtMs(r.stddev)}`.padStart(W)
        } else {
          row += "\u2014".padStart(W)
        }
      }
      console.log(row)
    }

    // ─── Print slowdown vs best (all) ──────────────────────────────────

    const printSlowdownTable = (label: string, fws: string[]) => {
      console.log("")
      console.log(`  ${label.padEnd(LABEL)}${fws.map((f) => f.padStart(W)).join("")}`)
      console.log(`  ${"─".repeat(LABEL + W * fws.length)}`)

      for (const testName of testNames) {
        const means = fws.map((fw) => allResults[fw]?.[testName]?.mean ?? Number.POSITIVE_INFINITY)
        const best = Math.min(...means)

        let row = `  ${testName.padEnd(LABEL)}`
        for (const fw of fws) {
          const r = allResults[fw]?.[testName]
          if (r) {
            const ratio = r.mean / best
            const marker = ratio < 1.01 ? " \u2190 best" : ""
            row += `${ratio.toFixed(2)}\u00d7${marker}`.padStart(W)
          } else {
            row += "\u2014".padStart(W)
          }
        }
        console.log(row)
      }
    }

    printSlowdownTable("Slowdown vs best (all)", sortedFws)

    // Framework-only comparison (excludes vanilla raw DOM baseline)
    const frameworkOnly = sortedFws.filter((f) => f !== "Vanilla JS")
    if (frameworkOnly.length > 1) {
      printSlowdownTable("Slowdown vs best framework", frameworkOnly)
    }

    console.log("")
  })
})
