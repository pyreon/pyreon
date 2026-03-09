/**
 * Real-browser benchmark tests for Nova.
 *
 * Runs the same 7 operations as bench-cli.ts but in Chromium via Playwright.
 * Each test verifies both correctness (DOM state) and records timing.
 * Results are printed to stdout for comparison with happy-dom numbers.
 */

import { test, expect } from "@playwright/test"

// Inject benchmark harness into the page using window.__nova
async function setupBench(page: import("@playwright/test").Page) {
  await page.goto("/")
  await page.waitForSelector("#layout", { timeout: 10_000 })

  // Inject the benchmark app into the DOM
  await page.evaluate(() => {
    const { h, mount, signal, batch } = (window as any).__nova

    // --- Data helpers ---
    const ADJ  = ["pretty","large","big","small","tall","short","long","handsome","plain","quaint","clean","elegant","easy","angry","crazy","helpful","mushy","odd","unsightly","adorable"]
    const COLS = ["red","yellow","blue","green","pink","brown","purple","white","black","orange"]
    const NOUN = ["table","chair","house","bbq","desk","car","pony","cookie","sandwich","burger","pizza","mouse","keyboard"]
    function pick(a: string[]) { return a[Math.floor(Math.random() * a.length)] }
    let _id = 1
    function makeRows(n: number) {
      return Array.from({ length: n }, () => ({
        id: _id++,
        label: signal(`${pick(ADJ)} ${pick(COLS)} ${pick(NOUN)}`),
      }))
    }

    const rows = signal<any[]>([])
    const selected = signal<number | null>(null)

    // Render a table with reactive rows
    const app = document.getElementById("app")!
    app.innerHTML = ""

    const container = document.createElement("div")
    container.id = "bench-root"
    app.appendChild(container)

    mount(
      h("table", { id: "bench-table" },
        h("tbody", { id: "bench-tbody" },
          () => rows().map((row: any) =>
            h("tr", {
              key: row.id,
              class: () => selected() === row.id ? "selected" : "",
              "data-id": row.id,
            },
              h("td", { class: "id-col" }, String(row.id)),
              h("td", { class: "label-col" }, () => row.label()),
            )
          )
        )
      ),
      container,
    )

    // Expose controls on window for tests
    ;(window as any).__bench = {
      rows,
      selected,
      makeRows,
      getRows: () => rows(),
      // Operations matching bench-cli.ts
      create1k: () => rows.set(makeRows(1000)),
      replaceAll: () => rows.set(makeRows(1000)),
      partialUpdate: () => {
        const cur = rows()
        for (let i = 0; i < cur.length; i += 10) {
          cur[i].label.update((l: string) => l + " !!!")
        }
      },
      selectRow: () => {
        const cur = rows()
        if (cur[500]) selected.set(cur[500].id)
      },
      swapRows: () => {
        const cur = [...rows()]
        if (cur.length >= 999) {
          const tmp = cur[1]; cur[1] = cur[998]; cur[998] = tmp
          rows.set(cur)
        }
      },
      clear: () => { rows.set([]); selected.set(null) },
      create10k: () => rows.set(makeRows(10_000)),
    }
  })
}

// Time an operation in the browser, return ms
async function timeOp(page: import("@playwright/test").Page, op: string, runs = 5): Promise<number> {
  return page.evaluate(({ op, runs }) => {
    const b = (window as any).__bench
    const times: number[] = []
    for (let i = 0; i < runs; i++) {
      const t = performance.now()
      b[op]()
      times.push(performance.now() - t)
    }
    return times.reduce((a: number, b: number) => a + b, 0) / runs
  }, { op, runs })
}

test.describe("Benchmark — real browser", () => {
  test("create 1,000 rows", async ({ page }) => {
    await setupBench(page)

    const ms = await timeOp(page, "create1k")
    const count = await page.locator("#bench-tbody tr").count()

    expect(count).toBe(1000)
    console.log(`  create1k:     ${ms.toFixed(2)}ms`)
  })

  test("replace all 1,000 rows", async ({ page }) => {
    await setupBench(page)

    // Create initial rows first
    await page.evaluate(() => (window as any).__bench.create1k())
    const firstId = await page.locator("#bench-tbody tr").first().getAttribute("data-id")

    const ms = await timeOp(page, "replaceAll")
    const count = await page.locator("#bench-tbody tr").count()
    const newFirstId = await page.locator("#bench-tbody tr").first().getAttribute("data-id")

    expect(count).toBe(1000)
    expect(newFirstId).not.toBe(firstId) // New rows, different IDs
    console.log(`  replaceAll:   ${ms.toFixed(2)}ms`)
  })

  test("partial update (every 10th row)", async ({ page }) => {
    await setupBench(page)
    await page.evaluate(() => (window as any).__bench.create1k())

    // Get label before update
    const before = await page.locator("#bench-tbody tr:nth-child(1) .label-col").textContent()

    const ms = await timeOp(page, "partialUpdate")

    // Verify the first row's label was appended with " !!!" (5 times for 5 runs)
    const after = await page.locator("#bench-tbody tr:nth-child(1) .label-col").textContent()
    expect(after).toContain("!!!")
    expect(after!.length).toBeGreaterThan(before!.length)

    // Verify a non-10th row was NOT modified
    const row5 = await page.locator("#bench-tbody tr:nth-child(6) .label-col").textContent()
    expect(row5).not.toContain("!!!")

    console.log(`  partialUpd:   ${ms.toFixed(3)}ms`)
  })

  test("select row", async ({ page }) => {
    await setupBench(page)
    await page.evaluate(() => (window as any).__bench.create1k())

    const ms = await timeOp(page, "selectRow", 5)

    // Verify exactly one row is selected (wait for reactive flush)
    await expect(page.locator("#bench-tbody tr.selected")).toHaveCount(1)

    console.log(`  selectRow:    ${ms.toFixed(3)}ms`)
  })

  test("swap rows (index 1 and 998)", async ({ page }) => {
    await setupBench(page)
    await page.evaluate(() => (window as any).__bench.create1k())

    const row2Before = await page.locator("#bench-tbody tr:nth-child(2) .label-col").textContent()
    const row999Before = await page.locator("#bench-tbody tr:nth-child(999) .label-col").textContent()

    const ms = await page.evaluate(() => {
      const b = (window as any).__bench
      const t = performance.now()
      b.swapRows()
      return performance.now() - t
    })

    const row2After = await page.locator("#bench-tbody tr:nth-child(2) .label-col").textContent()
    const row999After = await page.locator("#bench-tbody tr:nth-child(999) .label-col").textContent()

    // After swap, row at index 1 should have the old row 998's label (and vice versa)
    expect(row2After).toBe(row999Before)
    expect(row999After).toBe(row2Before)

    // Total count unchanged
    expect(await page.locator("#bench-tbody tr").count()).toBe(1000)

    console.log(`  swapRows:     ${ms.toFixed(3)}ms`)
  })

  test("clear all rows", async ({ page }) => {
    await setupBench(page)
    await page.evaluate(() => (window as any).__bench.create1k())
    expect(await page.locator("#bench-tbody tr").count()).toBe(1000)

    const ms = await timeOp(page, "clear")

    expect(await page.locator("#bench-tbody tr").count()).toBe(0)
    console.log(`  clear:        ${ms.toFixed(3)}ms`)
  })

  test("create 10,000 rows", async ({ page }) => {
    await setupBench(page)

    const ms = await page.evaluate(() => {
      const b = (window as any).__bench
      const t = performance.now()
      b.create10k()
      return performance.now() - t
    })

    const count = await page.locator("#bench-tbody tr").count()
    expect(count).toBe(10_000)

    console.log(`  create10k:    ${ms.toFixed(2)}ms`)
  })

  test("full benchmark summary", async ({ page }) => {
    await setupBench(page)

    const results = await page.evaluate(() => {
      const b = (window as any).__bench
      const RUNS = 5
      function bench(op: string) {
        const times: number[] = []
        for (let i = 0; i < RUNS; i++) {
          const t = performance.now()
          b[op]()
          times.push(performance.now() - t)
        }
        return times.reduce((a: number, b: number) => a + b, 0) / RUNS
      }

      // Warm up
      b.create1k()
      b.clear()

      const r: Record<string, number> = {}
      r.create1k = bench("create1k")
      r.replaceAll = bench("replaceAll")

      // partialUpdate
      const times: number[] = []
      for (let i = 0; i < RUNS; i++) {
        const t = performance.now()
        b.partialUpdate()
        times.push(performance.now() - t)
      }
      r.partialUpd = times.reduce((a: number, b: number) => a + b, 0) / RUNS

      // selectRow
      const selTimes: number[] = []
      for (let i = 0; i < RUNS; i++) {
        const t = performance.now()
        b.selectRow()
        selTimes.push(performance.now() - t)
      }
      r.selectRow = selTimes.reduce((a: number, b: number) => a + b, 0) / RUNS

      // swapRows — need to re-create between runs since state changes
      const swapTimes: number[] = []
      for (let i = 0; i < RUNS; i++) {
        b.create1k()
        const t = performance.now()
        b.swapRows()
        swapTimes.push(performance.now() - t)
      }
      r.swapRows = swapTimes.reduce((a: number, b: number) => a + b, 0) / RUNS

      // clear
      b.create1k()
      const clearTimes: number[] = []
      for (let i = 0; i < RUNS; i++) {
        b.create1k()
        const t = performance.now()
        b.clear()
        clearTimes.push(performance.now() - t)
      }
      r.clear = clearTimes.reduce((a: number, b: number) => a + b, 0) / RUNS

      // create10k
      b.clear()
      const c10kTimes: number[] = []
      for (let i = 0; i < RUNS; i++) {
        b.clear()
        const t = performance.now()
        b.create10k()
        c10kTimes.push(performance.now() - t)
      }
      r.create10k = c10kTimes.reduce((a: number, b: number) => a + b, 0) / RUNS

      return r
    })

    console.log("\n  ╔══════════════════════════════════════╗")
    console.log("  ║   Nova — Real Browser Benchmark      ║")
    console.log("  ╠══════════════════════════════════════╣")
    console.log(`  ║  create1k:     ${results.create1k.toFixed(2).padStart(8)}ms         ║`)
    console.log(`  ║  replaceAll:   ${results.replaceAll.toFixed(2).padStart(8)}ms         ║`)
    console.log(`  ║  partialUpd:   ${results.partialUpd.toFixed(3).padStart(8)}ms         ║`)
    console.log(`  ║  selectRow:    ${results.selectRow.toFixed(3).padStart(8)}ms         ║`)
    console.log(`  ║  swapRows:     ${results.swapRows.toFixed(3).padStart(8)}ms         ║`)
    console.log(`  ║  clear:        ${results.clear.toFixed(3).padStart(8)}ms         ║`)
    console.log(`  ║  create10k:    ${results.create10k.toFixed(2).padStart(8)}ms         ║`)
    console.log("  ╚══════════════════════════════════════╝\n")

    // Sanity: all operations should complete
    expect(results.create1k).toBeGreaterThan(0)
    expect(results.replaceAll).toBeGreaterThan(0)
    expect(results.create10k).toBeGreaterThan(0)
  })
})
