/**
 * @pyreon/document render-throughput benchmark.
 *
 * Measures pure serialization throughput (docs/sec + ms/doc) for every
 * STRING output format on a representative document tree, at two sizes.
 *
 * SCOPE (honest): this is an INTERNAL cross-format throughput bench — it
 * compares the relative serialization cost of Pyreon's own formats against
 * each other. There is no external head-to-head here: no single competitor
 * spans this multi-format surface (react-pdf is PDF-only, turndown is
 * HTML→MD-only, etc.), and building a faithful equivalent document in each
 * would compare document MODELS, not serializers. The number to read is the
 * relative cost across formats + the absolute docs/sec on this machine.
 *
 * EXCLUDED: the four binary formats (pdf/docx/xlsx/pptx) are NOT measured —
 * they lazy-load heavy optional deps (pdfmake ~3MB, exceljs, docx, pptxgenjs)
 * whose own engine cost dominates and swamps Pyreon's tree-walk. Their cost is
 * a property of the vendored engine, not this package's serializer.
 *
 * OBJECTIVITY CONTRACT:
 *   1. `NODE_ENV=production` is forced FIRST — framework packages gate dev-only
 *      instrumentation on it; benching dev mode measures the instrumentation.
 *   2. Each format's lazy renderer import is warmed (and cached) BEFORE timing,
 *      so the one-time dynamic-import cost never lands in a timed window.
 *   3. Throughput is the MEDIAN of 7 timed windows; the min–max spread across
 *      those windows is reported so run-to-run variance is visible (RUNG R1).
 *   4. GC is NOT forced between windows — forcing `Bun.gc(true)` in a JSC loop
 *      jettisons compiled code and produces re-tier bimodality (a known trap).
 *   5. Every format's output is asserted non-empty before timing, so a format
 *      that "wins" by producing nothing is caught.
 *
 * Usage: NODE_ENV=production bun scripts/bench/core/document.ts [--json]
 */

process.env.NODE_ENV = 'production'

import {
  Button,
  Code,
  Divider,
  Document,
  Heading,
  Image,
  Link,
  List,
  ListItem,
  Page,
  Quote,
  Section,
  Table,
  Text,
  render,
} from '../../../packages/fundamentals/document/src/index'
import type { DocNode, OutputFormat } from '../../../packages/fundamentals/document/src/index'

const JSON_MODE = process.argv.includes('--json')

// ─── Representative document ─────────────────────────────────────────────────

/** A realistic report: metadata, headings, prose, a table of `rowCount` rows,
 *  a list, code, a quote, links, an image, a button, dividers. */
function buildReport(rowCount: number): DocNode {
  const rows: string[][] = []
  for (let i = 0; i < rowCount; i++) {
    rows.push([`Region ${i}`, `$${(i * 1234).toLocaleString()}`, `${(i % 30) - 5}%`, `Note ${i}`])
  }

  return Document({
    title: 'Quarterly Report',
    author: 'Analytics Team',
    subject: 'Q4 2026 performance summary',
    children: [
      Page({
        children: [
          Heading({ level: 1, children: 'Sales Report' }),
          Text({ children: 'Q4 2026 performance summary across all regions.' }),
          Section({
            children: [
              Heading({ level: 2, children: 'Highlights' }),
              List({
                children: [
                  ListItem({ children: 'Record quarter for APAC' }),
                  ListItem({ children: 'EU impacted by currency exchange' }),
                  ListItem({ children: 'US steady at +15%' }),
                ],
              }),
              Quote({ children: 'Best performance in three years.' }),
            ],
          }),
          Divider({}),
          Heading({ level: 2, children: 'Regional Breakdown' }),
          Table({
            columns: ['Region', 'Revenue', 'Growth', 'Notes'],
            rows,
            striped: true,
            headerStyle: { background: '#1a1a2e', color: '#ffffff', bold: true },
          }),
          Code({ language: 'sql', children: 'SELECT region, SUM(revenue) FROM sales GROUP BY region' }),
          Image({ src: 'https://cdn.example.com/chart.png', width: 500, alt: 'Revenue chart' }),
          Text({ bold: true, children: 'Prepared by the Analytics Team.' }),
          Link({ href: 'https://example.com/report', children: 'View full report' }),
          Button({ href: 'https://example.com/export', background: '#4f46e5', children: 'Export' }),
        ],
      }),
    ],
  })
}

// ─── Harness ─────────────────────────────────────────────────────────────────

const STRING_FORMATS: OutputFormat[] = [
  'json',
  'jsonl',
  'text',
  'md',
  'csv',
  'html',
  'email',
  'svg',
  'slack',
  'teams',
  'discord',
  'telegram',
  'notion',
  'confluence',
  'whatsapp',
  'google-chat',
]

interface Row {
  format: string
  docsPerSec: number
  msPerDoc: number
  minDps: number
  maxDps: number
  bytes: number
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!
}

async function benchFormat(node: DocNode, format: OutputFormat): Promise<Row> {
  // Warm up: caches the lazy renderer import + JITs the walk.
  const sample = (await render(node, format)) as string
  if (!sample || sample.length === 0) {
    throw new Error(`[bench] format '${format}' produced empty output — refusing to time it`)
  }
  for (let i = 0; i < 30; i++) await render(node, format)

  // Adaptive inner batch — for fast formats a single async render() is
  // sub-10µs, so a GC pause landing in the window destroys the count. Size the
  // batch so each measured unit does ≥~250µs of work; a GC pause is then a
  // small fraction of it and the per-window throughput is stable.
  const probeStart = performance.now()
  for (let i = 0; i < 50; i++) await render(node, format)
  const perOpMs = (performance.now() - probeStart) / 50
  const batch = Math.max(1, Math.ceil(0.25 / Math.max(perOpMs, 1e-6)))

  const windows: number[] = []
  const windowMs = 400
  for (let w = 0; w < 7; w++) {
    let ops = 0
    const start = performance.now()
    const end = start + windowMs
    while (performance.now() < end) {
      for (let b = 0; b < batch; b++) await render(node, format)
      ops += batch
    }
    const elapsed = performance.now() - start
    windows.push((ops / elapsed) * 1000)
  }

  const dps = median(windows)
  return {
    format,
    docsPerSec: dps,
    msPerDoc: 1000 / dps,
    minDps: Math.min(...windows),
    maxDps: Math.max(...windows),
    bytes: sample.length,
  }
}

async function benchSize(label: string, rowCount: number): Promise<Row[]> {
  const node = buildReport(rowCount)
  const rows: Row[] = []
  for (const format of STRING_FORMATS) {
    rows.push(await benchFormat(node, format))
  }
  rows.sort((a, b) => b.docsPerSec - a.docsPerSec)
  if (!JSON_MODE) {
    console.log(`\n  ${label} (table: ${rowCount} rows)`)
    console.log(
      `    ${'format'.padEnd(14)}${'docs/sec'.padStart(12)}${'ms/doc'.padStart(10)}${'out bytes'.padStart(12)}   spread`,
    )
    for (const r of rows) {
      const spread = `${Math.round(r.minDps)}–${Math.round(r.maxDps)}`
      console.log(
        `    ${r.format.padEnd(14)}${Math.round(r.docsPerSec).toLocaleString().padStart(12)}${r.msPerDoc.toFixed(3).padStart(10)}${r.bytes.toLocaleString().padStart(12)}   ${spread}`,
      )
    }
  }
  return rows
}

async function main(): Promise<void> {
  if (!JSON_MODE) {
    console.log('@pyreon/document — render throughput (INTERNAL cross-format, RUNG R1 measured)')
    console.log('  median of 7×400ms windows · NODE_ENV=production · binary formats excluded')
  }

  const small = await benchSize('SMALL report', 10)
  const large = await benchSize('LARGE report', 500)

  if (JSON_MODE) {
    console.log(
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          small: Object.fromEntries(small.map((r) => [r.format, { docsPerSec: r.docsPerSec, msPerDoc: r.msPerDoc, bytes: r.bytes }])),
          large: Object.fromEntries(large.map((r) => [r.format, { docsPerSec: r.docsPerSec, msPerDoc: r.msPerDoc, bytes: r.bytes }])),
        },
        null,
        2,
      ),
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
