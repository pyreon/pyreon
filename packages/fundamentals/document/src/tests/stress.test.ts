import { describe, expect, it } from "vitest"
import {
  Document,
  Heading,
  List,
  ListItem,
  Page,
  PageBreak,
  Quote,
  render,
  Section,
  Spacer,
  Table,
  Text,
} from "../index"
import type { DocNode } from "../types"

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateRows(count: number, cols: number): string[][] {
  return Array.from({ length: count }, (_row, i) =>
    Array.from({ length: cols }, (_col, j) => `Row ${i + 1} Col ${j + 1}`),
  )
}

function generateLargeDocument(pages: number, rowsPerTable: number): DocNode {
  const pageNodes: DocNode[] = []
  for (let p = 0; p < pages; p++) {
    pageNodes.push(
      Page({
        children: [
          Heading({ level: 1, children: `Page ${p + 1}` }),
          Text({
            children: `This is page ${p + 1} of the stress test document.`,
          }),
          Table({
            columns: ["ID", "Name", "Value", "Status", "Notes"],
            rows: generateRows(rowsPerTable, 5),
            striped: true,
            headerStyle: { background: "#1a1a2e", color: "#fff" },
          }),
          Spacer({ height: 20 }),
          List({
            ordered: true,
            children: Array.from({ length: 10 }, (_, i) =>
              ListItem({ children: `Item ${i + 1} on page ${p + 1}` }),
            ),
          }),
          Quote({ children: `Summary for page ${p + 1}` }),
          ...(p < pages - 1 ? [PageBreak()] : []),
        ],
      }),
    )
  }

  return Document({
    title: "Stress Test Document",
    author: "Pyreon Test Suite",
    children: pageNodes,
  })
}

// ─── HTML Stress Tests ──────────────────────────────────────────────────────

describe("HTML stress tests", () => {
  it("renders 50-page document", async () => {
    const doc = generateLargeDocument(50, 20)
    const html = (await render(doc, "html")) as string
    expect(html.length).toBeGreaterThan(100000)
    expect(html).toContain("Page 1")
    expect(html).toContain("Page 50")
    expect(html).toContain("Row 20 Col 5")
  })

  it("renders 1000-row table", async () => {
    const doc = Document({
      children: Table({
        columns: ["A", "B", "C", "D", "E", "F", "G", "H"],
        rows: generateRows(1000, 8),
        striped: true,
        bordered: true,
      }),
    })
    const html = (await render(doc, "html")) as string
    expect(html).toContain("Row 1 Col 1")
    expect(html).toContain("Row 1000 Col 8")
  })

  it("renders deeply nested sections", async () => {
    let node: DocNode = Text({ children: "Deep content" })
    for (let i = 0; i < 20; i++) {
      node = Section({ children: node })
    }
    const doc = Document({ children: node })
    const html = (await render(doc, "html")) as string
    expect(html).toContain("Deep content")
  })
})

// ─── Email Stress Tests ─────────────────────────────────────────────────────

describe("email stress tests", () => {
  it("renders large email with multiple sections", async () => {
    const doc = generateLargeDocument(5, 50)
    const html = (await render(doc, "email")) as string
    expect(html).toContain("max-width:600px")
    expect(html).toContain("Page 5")
    expect(html).toContain("Row 50 Col 5")
  })
})

// ─── Markdown Stress Tests ──────────────────────────────────────────────────

describe("Markdown stress tests", () => {
  it("renders 1000-row table as pipe table", async () => {
    const doc = Document({
      children: Table({
        columns: ["Name", "Value"],
        rows: generateRows(1000, 2),
      }),
    })
    const md = (await render(doc, "md")) as string
    expect(md).toContain("Row 1 Col 1")
    expect(md).toContain("Row 1000 Col 2")
    // Count pipe rows
    const pipeLines = md.split("\n").filter((l) => l.startsWith("|"))
    expect(pipeLines.length).toBeGreaterThanOrEqual(1002) // header + separator + 1000 rows
  })
})

// ─── CSV Stress Tests ───────────────────────────────────────────────────────

describe("CSV stress tests", () => {
  it("renders multiple large tables", async () => {
    const doc = Document({
      children: [
        Table({
          columns: ["A", "B", "C"],
          rows: generateRows(500, 3),
          caption: "Table 1",
        }),
        Table({
          columns: ["X", "Y", "Z"],
          rows: generateRows(500, 3),
          caption: "Table 2",
        }),
      ],
    })
    const csv = (await render(doc, "csv")) as string
    expect(csv).toContain("# Table 1")
    expect(csv).toContain("# Table 2")
    const lines = csv.split("\n").filter((l) => l.trim().length > 0)
    expect(lines.length).toBeGreaterThanOrEqual(1004) // 2 tables × (header + 500 rows) + 2 captions
  })
})

// ─── Text Stress Tests ──────────────────────────────────────────────────────

describe("text stress tests", () => {
  it("renders large aligned table", async () => {
    const doc = Document({
      children: Table({
        columns: [
          { header: "ID", align: "right" as const },
          { header: "Name", align: "left" as const },
          { header: "Amount", align: "right" as const },
        ],
        rows: generateRows(200, 3),
      }),
    })
    const text = (await render(doc, "text")) as string
    expect(text).toContain("Row 200 Col 3")
  })
})

// ─── SVG Stress Tests ───────────────────────────────────────────────────────

describe("SVG stress tests", () => {
  it("renders document with many elements", async () => {
    const children: DocNode[] = []
    for (let i = 0; i < 100; i++) {
      children.push(Heading({ level: 2, children: `Section ${i + 1}` }))
      children.push(Text({ children: `Content for section ${i + 1}` }))
    }
    const doc = Document({ children })
    const svg = (await render(doc, "svg")) as string
    expect(svg).toContain("<svg")
    expect(svg).toContain("Section 100")
    // Height should be large
    const match = svg.match(/height="(\d+)"/)
    expect(Number(match?.[1])).toBeGreaterThan(3000)
  })
})

// ─── Slack Stress Tests ─────────────────────────────────────────────────────

describe("Slack stress tests", () => {
  it("renders large document to blocks", async () => {
    const doc = generateLargeDocument(10, 10)
    const json = (await render(doc, "slack")) as string
    const parsed = JSON.parse(json)
    expect(parsed.blocks.length).toBeGreaterThan(50)
  })
})

// ─── PDF Stress Tests ───────────────────────────────────────────────────────

describe("PDF stress tests", () => {
  it("renders 10-page document with large tables", async () => {
    const doc = generateLargeDocument(10, 50)
    const pdf = await render(doc, "pdf")
    expect(pdf).toBeInstanceOf(Uint8Array)
    expect((pdf as Uint8Array).length).toBeGreaterThan(10000)
    // PDF header
    const header = String.fromCharCode(...(pdf as Uint8Array).slice(0, 5))
    expect(header).toBe("%PDF-")
  }, 30000)
})

// ─── DOCX Stress Tests ──────────────────────────────────────────────────────

describe("DOCX stress tests", () => {
  it("renders document with 500-row table", async () => {
    const doc = Document({
      title: "Large DOCX",
      children: Page({
        children: [
          Heading({ children: "Large Table" }),
          Table({
            columns: ["A", "B", "C", "D"],
            rows: generateRows(500, 4),
            striped: true,
            bordered: true,
          }),
        ],
      }),
    })
    const docx = await render(doc, "docx")
    expect(docx).toBeInstanceOf(Uint8Array)
    expect((docx as Uint8Array).length).toBeGreaterThan(5000)
    // DOCX is a ZIP — starts with PK
    const header = String.fromCharCode(...(docx as Uint8Array).slice(0, 2))
    expect(header).toBe("PK")
  }, 30000)
})

// ─── XLSX Stress Tests ──────────────────────────────────────────────────────

describe("XLSX stress tests", () => {
  it("renders 1000-row spreadsheet", async () => {
    const doc = Document({
      title: "Large XLSX",
      children: Table({
        columns: ["ID", "Name", "Revenue", "Growth", "Region"],
        rows: Array.from({ length: 1000 }, (_, i) => [
          String(i + 1),
          `Company ${i + 1}`,
          `$${(Math.random() * 1000000).toFixed(0)}`,
          `${(Math.random() * 100).toFixed(1)}%`,
          ["US", "EU", "APAC", "LATAM"][i % 4]!,
        ]),
        striped: true,
      }),
    })
    const xlsx = await render(doc, "xlsx")
    expect(xlsx).toBeInstanceOf(Uint8Array)
    expect((xlsx as Uint8Array).length).toBeGreaterThan(10000)
  }, 30000)
})

// ─── PPTX Stress Tests ──────────────────────────────────────────────────────

describe("PPTX stress tests", () => {
  it("renders 20-slide presentation", async () => {
    const pages: DocNode[] = []
    for (let i = 0; i < 20; i++) {
      pages.push(
        Page({
          children: [
            Heading({ children: `Slide ${i + 1}` }),
            Text({ children: `Content for slide ${i + 1}` }),
            Table({
              columns: ["Metric", "Value"],
              rows: [
                ["Revenue", `$${(i + 1) * 100}K`],
                ["Growth", `${(i + 1) * 5}%`],
              ],
            }),
          ],
        }),
      )
    }
    const doc = Document({ title: "Large Presentation", children: pages })
    const pptx = await render(doc, "pptx")
    expect(pptx).toBeInstanceOf(Uint8Array)
    expect((pptx as Uint8Array).length).toBeGreaterThan(5000)
  }, 30000)
})

// ─── Edge Cases ─────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("handles empty document", async () => {
    const doc = Document({ children: [] as unknown as undefined })
    const html = (await render(doc, "html")) as string
    expect(html).toContain("<!DOCTYPE html>")
  })

  it("handles empty table", async () => {
    const doc = Document({
      children: Table({ columns: ["A", "B"], rows: [] }),
    })
    const html = (await render(doc, "html")) as string
    expect(html).toContain("<table")
  })

  it("handles special characters in text", async () => {
    const doc = Document({
      children: [
        Text({ children: "Hello <world> & \"quotes\" 'apostrophe'" }),
        Heading({ children: "Heading with <html>" }),
      ],
    })
    const html = (await render(doc, "html")) as string
    expect(html).toContain("&lt;world&gt;")
    expect(html).toContain("&amp;")
    expect(html).toContain("&quot;")
  })

  it("handles unicode text", async () => {
    const doc = Document({
      children: [
        Text({ children: "日本語テスト" }),
        Text({ children: "العربية" }),
        Text({ children: "🎉🚀✨" }),
      ],
    })
    const html = (await render(doc, "html")) as string
    expect(html).toContain("日本語テスト")
    expect(html).toContain("العربية")
    expect(html).toContain("🎉🚀✨")
  })

  it("handles very long text", async () => {
    const longText = "A".repeat(100000)
    const doc = Document({ children: Text({ children: longText }) })
    const html = (await render(doc, "html")) as string
    expect(html.length).toBeGreaterThan(100000)
  })
})
