/**
 * Real-browser framework comparison benchmark.
 *
 * Uses the benchmark app (port 5174) which already has all frameworks:
 * Vanilla JS, React 19, Vue 3, Preact, SolidJS, Nova.
 *
 * Clicks "Run Benchmarks", waits for completion, and scrapes the results table.
 * This gives real Chromium performance numbers with forced layout flushes.
 */

import { test, expect } from "@playwright/test"

const BENCH_URL = "http://localhost:5174"

test.describe("Framework Comparison Benchmark", () => {
  test("run all framework benchmarks and compare", async ({ page }) => {
    test.setTimeout(300_000) // 5 min — benchmarks take time

    await page.goto(BENCH_URL)
    await expect(page.locator("h1")).toContainText("Nova")

    // Click run button
    const runBtn = page.locator("#run")
    await expect(runBtn).toBeVisible()
    await runBtn.click()

    // Wait for "Done" status — this may take a while
    await expect(page.locator("#status")).toHaveText("Done ✓", { timeout: 240_000 })

    // Scrape the results table
    const results = await page.evaluate(() => {
      const tables = document.querySelectorAll("table")
      if (tables.length === 0) return null

      const mainTable = tables[0]!
      const headers = Array.from(mainTable.querySelectorAll("thead th")).map(
        (th) => th.textContent?.trim() ?? "",
      )
      const rows: Record<string, Record<string, string>> = {}

      mainTable.querySelectorAll("tbody tr").forEach((tr) => {
        const cells = tr.querySelectorAll("td")
        const testName = cells[0]?.textContent?.trim() ?? ""
        rows[testName] = {}
        for (let i = 1; i < cells.length; i++) {
          const framework = headers[i] ?? `col${i}`
          rows[testName]![framework] = cells[i]?.textContent?.trim() ?? ""
        }
      })

      // Also get the slowdown table if present
      let slowdowns: Record<string, Record<string, string>> | null = null
      if (tables.length > 1) {
        const slowTable = tables[1]!
        const slowHeaders = Array.from(slowTable.querySelectorAll("thead th")).map(
          (th) => th.textContent?.trim() ?? "",
        )
        slowdowns = {}
        slowTable.querySelectorAll("tbody tr").forEach((tr) => {
          const cells = tr.querySelectorAll("td")
          const testName = cells[0]?.textContent?.trim() ?? ""
          slowdowns![testName] = {}
          for (let i = 1; i < cells.length; i++) {
            const framework = slowHeaders[i] ?? `col${i}`
            slowdowns![testName]![framework] = cells[i]?.textContent?.trim() ?? ""
          }
        })
      }

      return { headers, rows, slowdowns }
    })

    expect(results).not.toBeNull()
    expect(results!.headers.length).toBeGreaterThanOrEqual(3) // Test + at least 2 frameworks

    // Print formatted results
    const frameworks = results!.headers.slice(1)
    const tests = Object.keys(results!.rows)

    console.log("\n  ╔══════════════════════════════════════════════════════════════════════════╗")
    console.log("  ║                    Real Browser Benchmark (Chromium)                    ║")
    console.log("  ╠══════════════════════════════════════════════════════════════════════════╣")

    // Print header row
    let header = `  ║  ${"Test".padEnd(16)}`
    for (const fw of frameworks) header += `│ ${fw.padStart(14)} `
    header += "║"
    console.log(header)
    console.log(`  ╠${"═".repeat(header.length - 5)}╣`)

    // Print data rows
    for (const testName of tests) {
      let row = `  ║  ${testName.padEnd(16)}`
      for (const fw of frameworks) {
        row += `│ ${(results!.rows[testName]![fw] ?? "—").padStart(14)} `
      }
      row += "║"
      console.log(row)
    }

    console.log("  ╚══════════════════════════════════════════════════════════════════════════╝")

    // Print slowdown table if available
    if (results!.slowdowns) {
      console.log("\n  Slowdown vs Vanilla JS (lower = better):")
      const slowTests = Object.keys(results!.slowdowns)
      const slowFws = Object.keys(results!.slowdowns[slowTests[0]!] ?? {})
      for (const testName of slowTests) {
        let row = `    ${testName.padEnd(16)}`
        for (const fw of slowFws) {
          row += `  ${fw}: ${results!.slowdowns![testName]![fw] ?? "—"}`.padEnd(20)
        }
        console.log(row)
      }
    }

    console.log("")

    // Verify Nova results exist
    const novaPresent = frameworks.some((f) => f.includes("Nova"))
    expect(novaPresent).toBe(true)

    // Verify all tests ran
    expect(tests.length).toBeGreaterThanOrEqual(5)
  })
})
