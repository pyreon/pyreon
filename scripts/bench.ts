import { join } from "node:path"
import { serve } from "bun"
/**
 * Headless benchmark runner using Playwright.
 * Usage: bun scripts/bench.ts
 *
 * Starts a local static server, runs the benchmark in headless Chromium,
 * prints results, and exits.
 */
import { chromium } from "playwright"

const DIST = join(import.meta.dir, "../apps/benchmark/dist")
const PORT = 4173

// Static file server for the benchmark dist
const server = serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    const path = url.pathname === "/" ? "/index.html" : url.pathname
    const file = Bun.file(join(DIST, path))
    if (await file.exists()) {
      return new Response(file)
    }
    return new Response("Not found", { status: 404 })
  },
})

const browser = await chromium.launch({
  headless: false,
  args: [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--window-size=1200,900",
  ],
})
const page = await browser.newPage()

page.on("console", (msg) => {
  if (msg.type() === "error") console.error("[page]", msg.text())
})
page.on("pageerror", (err) => console.error("[page error]", err.message))

await page.goto(`http://localhost:${PORT}`)

// Click "Run Benchmarks" and wait for completion
await page.click("#run")
await page.waitForFunction(
  () => (document.getElementById("status") as HTMLElement)?.textContent === "Done ✓",
  { timeout: 5 * 60 * 1000 }, // 5 min max
)

// Extract results table
const results = await page.evaluate(() => {
  const tables = document.querySelectorAll("#results table")
  if (!tables[0]) return null

  const rows = Array.from(tables[0].querySelectorAll("tbody tr"))
  const headers = Array.from(tables[0].querySelectorAll("thead th")).map(
    (th) => th.textContent?.trim() ?? "",
  )

  return {
    headers,
    rows: rows.map((row) => ({
      name: row.querySelector("td")?.textContent?.trim() ?? "",
      values: Array.from(row.querySelectorAll("td:not(:first-child)")).map(
        (td) => td.textContent?.trim() ?? "",
      ),
    })),
  }
})

await browser.close()
server.stop()

if (!results) {
  console.error("No results found")
  process.exit(1)
}

// Print table
const col0 = 32
const colW = 18
const header = results.headers.map((h, i) => (i === 0 ? h.padEnd(col0) : h.padStart(colW))).join("")
console.log(`\n${header}`)
console.log("-".repeat(col0 + colW * (results.headers.length - 1)))
for (const row of results.rows) {
  const line = [row.name.padEnd(col0), ...row.values.map((v) => v.padStart(colW))].join("")
  console.log(line)
}
console.log()
