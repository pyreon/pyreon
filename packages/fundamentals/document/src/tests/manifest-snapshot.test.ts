import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — document snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(`"- @pyreon/document — Universal document rendering — 18 primitives, 14+ output formats. Heavy format renderers are lazy-loaded: PDF (~3MB via pdfmake + bundled fonts), DOCX (~700KB via docx), XLSX (~1.1MB via exceljs), PPTX (~400KB via pptxgenjs). First render of each format triggers the dynamic import; subsequent renders are instant. The vendored architecture means apps download all renderer chunks during npm install (14MB total \`lib/\`), but consumer-side bundlers tree-shake to only ship the renderers an app actually invokes."`)
  })

  it('renders to llms-full.txt section', () => {
    expect(renderLlmsFullSection(manifest)).toMatchInlineSnapshot(`
      "## @pyreon/document — Universal Document Rendering

      Universal document rendering for Pyreon. One template, every output format: HTML, PDF, DOCX, XLSX, PPTX, email, Markdown, plain text, CSV, SVG, Slack, Teams, Discord, Telegram, Notion, Confluence, WhatsApp, Google Chat. Heavy renderers are lazy-loaded — chunks (PDF ~3MB pdfmake + fonts, DOCX ~700KB, XLSX ~1.1MB, PPTX ~400KB) only load when invoked. The vendored architecture means one npm install covers every format; apps that never render to a heavy format never pay its chunk cost. Supports both JSX primitives and a fluent builder API.

      \`\`\`typescript
      import { Document, Page, Heading, Text, Table, Image, List, Code, Divider, render, createDocument, download } from '@pyreon/document'

      // JSX primitives — compose a document tree
      const report = (
        <Document title="Q4 Sales Report" author="Analytics Team">
          <Page>
            <Heading level={1}>Sales Report</Heading>
            <Text>Q4 2026 performance summary.</Text>
            <Table
              columns={['Region', 'Revenue', 'Growth']}
              rows={[
                ['US', '$1.2M', '+15%'],
                ['EU', '$800K', '+8%'],
                ['APAC', '$500K', '+22%'],
              ]}
            />
            <Divider />
            <Heading level={2}>Notes</Heading>
            <List items={['Record quarter for APAC', 'EU impacted by currency exchange']} />
            <Code language="sql">SELECT region, SUM(revenue) FROM sales GROUP BY region</Code>
          </Page>
        </Document>
      )

      // Render to any format:
      const pdf = await render(report, 'pdf')            // Uint8Array
      const html = await render(report, 'html')           // string
      const email = await render(report, 'email')         // Outlook-safe HTML
      const docx = await render(report, 'docx')           // Uint8Array
      const xlsx = await render(report, 'xlsx')           // Uint8Array
      const md = await render(report, 'md')               // Markdown string
      const slack = await render(report, 'slack')          // Slack Block Kit JSON
      const notion = await render(report, 'notion')        // Notion blocks
      const teams = await render(report, 'teams')          // Adaptive Card JSON

      // Browser download helper:
      download(pdf, 'report.pdf')

      // Builder API — alternative to JSX:
      const doc = createDocument({ title: 'Report' })
        .heading('Sales Report')
        .text('Q4 2026 performance summary.')
        .table({ columns: ['Region', 'Revenue'], rows: [['US', '$1M']] })

      await doc.toPdf()       // PDF
      await doc.toEmail()     // email-safe HTML
      await doc.toDocx()      // Word document
      await doc.toSlack()     // Slack Block Kit
      await doc.toNotion()    // Notion blocks
      \`\`\`

      > **Note**: Heavy format renderers are lazy-loaded: PDF (~3MB via pdfmake + bundled fonts), DOCX (~700KB via docx), XLSX (~1.1MB via exceljs), PPTX (~400KB via pptxgenjs). First render of each format triggers the dynamic import; subsequent renders are instant. The vendored architecture means apps download all renderer chunks during npm install (14MB total \`lib/\`), but consumer-side bundlers tree-shake to only ship the renderers an app actually invokes.
      >
      > **Format return types**: Binary formats (pdf, docx, xlsx, pptx) return Uint8Array. Text formats (html, email, md, text, csv, slack, teams, discord, telegram, notion, confluence, whatsapp, gchat, svg) return string.
      >
      > **JSX vs Builder**: Both APIs produce the same DocNode tree. JSX primitives are better for complex layouts with conditional sections. The builder API is better for programmatic generation (e.g. loop over data to build rows).
      >
      > **document-primitives**: For components that render in the browser AND export to documents, use \`@pyreon/document-primitives\` (rocketstyle-based) + \`@pyreon/connector-document\` — not the raw primitives from this package.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).length).toBe(4)
  })
})
