import { afterEach, describe, expect, it } from 'vitest'
import {
  _resetRenderers,
  Button,
  Code,
  createDocument,
  Divider,
  Document,
  Heading,
  Link,
  List,
  ListItem,
  Page,
  Quote,
  render,
  Table,
  Text,
} from '../index'

afterEach(() => {
  _resetRenderers()
})

// ─── Slack Renderer ────────────────────────────────────────────────────────

describe('Slack renderer', () => {
  it('renders heading as header block', async () => {
    const doc = Document({ children: Heading({ children: 'Title' }) })
    const result = (await render(doc, 'slack')) as string
    const parsed = JSON.parse(result)
    expect(parsed.blocks).toBeDefined()
    const header = parsed.blocks.find((b: any) => b.type === 'header')
    expect(header).toBeDefined()
    expect(header.text.text).toBe('Title')
  })

  it('renders bold text with Slack mrkdwn', async () => {
    const doc = Document({ children: Text({ bold: true, children: 'important' }) })
    const result = (await render(doc, 'slack')) as string
    const parsed = JSON.parse(result)
    const section = parsed.blocks.find((b: any) => b.type === 'section')
    expect(section.text.text).toBe('*important*')
  })

  it('renders divider block', async () => {
    const doc = Document({ children: Divider() })
    const result = (await render(doc, 'slack')) as string
    const parsed = JSON.parse(result)
    expect(parsed.blocks.some((b: any) => b.type === 'divider')).toBe(true)
  })

  it('renders button as action block', async () => {
    const doc = Document({
      children: Button({ href: 'https://example.com', children: 'Click' }),
    })
    const result = (await render(doc, 'slack')) as string
    const parsed = JSON.parse(result)
    const action = parsed.blocks.find((b: any) => b.type === 'actions')
    expect(action).toBeDefined()
    expect(action.elements[0].text.text).toBe('Click')
  })

  it('renders list as mrkdwn', async () => {
    const doc = Document({
      children: List({
        ordered: true,
        children: [ListItem({ children: 'one' }), ListItem({ children: 'two' })],
      }),
    })
    const result = (await render(doc, 'slack')) as string
    const parsed = JSON.parse(result)
    const section = parsed.blocks.find((b: any) => b.type === 'section')
    expect(section.text.text).toContain('1. one')
    expect(section.text.text).toContain('2. two')
  })

  it('renders table as code block', async () => {
    const doc = Document({
      children: Table({ columns: ['Name', 'Price'], rows: [['Widget', '$10']] }),
    })
    const result = (await render(doc, 'slack')) as string
    const parsed = JSON.parse(result)
    const section = parsed.blocks.find((b: any) => b.type === 'section')
    expect(section.text.text).toContain('*Name*')
    expect(section.text.text).toContain('Widget')
  })

  it('renders quote with >', async () => {
    const doc = Document({ children: Quote({ children: 'wise words' }) })
    const result = (await render(doc, 'slack')) as string
    const parsed = JSON.parse(result)
    const section = parsed.blocks.find((b: any) => b.type === 'section')
    expect(section.text.text).toContain('> wise words')
  })
})

// ─── Discord Renderer ──────────────────────────────────────────────────────

describe('Discord renderer', () => {
  it('renders document as embed JSON', async () => {
    const doc = Document({
      title: 'Report',
      children: [
        Heading({ children: 'Report' }),
        Text({ children: 'Summary text.' }),
      ],
    })
    const result = (await render(doc, 'discord')) as string
    const parsed = JSON.parse(result)
    expect(parsed.embeds).toBeDefined()
    expect(parsed.embeds[0].title).toBe('Report')
    expect(parsed.embeds[0].description).toContain('Summary text.')
  })

  it('renders bold and italic text', async () => {
    const doc = Document({
      children: [
        Text({ bold: true, children: 'bold' }),
        Text({ italic: true, children: 'italic' }),
      ],
    })
    const result = (await render(doc, 'discord')) as string
    const parsed = JSON.parse(result)
    expect(parsed.embeds[0].description).toContain('**bold**')
    expect(parsed.embeds[0].description).toContain('*italic*')
  })

  it('renders small table as embed fields', async () => {
    const doc = Document({
      children: Table({
        columns: ['Name', 'Price'],
        rows: [['Widget', '$10'], ['Gadget', '$20']],
      }),
    })
    const result = (await render(doc, 'discord')) as string
    const parsed = JSON.parse(result)
    expect(parsed.embeds[0].fields).toBeDefined()
    expect(parsed.embeds[0].fields.length).toBe(2)
  })
})

// ─── Telegram Renderer ─────────────────────────────────────────────────────

describe('Telegram renderer', () => {
  it('renders heading as bold', async () => {
    const doc = Document({ children: Heading({ children: 'Title' }) })
    const result = (await render(doc, 'telegram')) as string
    expect(result).toContain('<b>Title</b>')
  })

  it('renders text with formatting', async () => {
    const doc = Document({
      children: Text({ bold: true, italic: true, children: 'styled' }),
    })
    const result = (await render(doc, 'telegram')) as string
    expect(result).toContain('<b>')
    expect(result).toContain('<i>')
    expect(result).toContain('styled')
  })

  it('renders link as anchor', async () => {
    const doc = Document({
      children: Link({ href: 'https://example.com', children: 'click' }),
    })
    const result = (await render(doc, 'telegram')) as string
    expect(result).toContain('href="https://example.com"')
    expect(result).toContain('click')
  })

  it('renders code with language class', async () => {
    const doc = Document({
      children: Code({ language: 'python', children: 'x = 1' }),
    })
    const result = (await render(doc, 'telegram')) as string
    expect(result).toContain('language-python')
    expect(result).toContain('x = 1')
  })

  it('renders quote as blockquote', async () => {
    const doc = Document({ children: Quote({ children: 'wise' }) })
    const result = (await render(doc, 'telegram')) as string
    expect(result).toContain('<blockquote>wise</blockquote>')
  })

  it('escapes HTML in text', async () => {
    const doc = Document({
      children: Text({ children: '<script>alert(1)</script>' }),
    })
    const result = (await render(doc, 'telegram')) as string
    expect(result).not.toContain('<script>')
    expect(result).toContain('&lt;script&gt;')
  })
})

// ─── SVG Renderer ──────────────────────────────────────────────────────────

describe('SVG renderer', () => {
  it('renders a simple document as SVG', async () => {
    const doc = Document({
      children: [Heading({ children: 'Title' }), Text({ children: 'Body' })],
    })
    const svg = (await render(doc, 'svg')) as string
    expect(svg).toContain('<svg')
    expect(svg).toContain('Title')
    expect(svg).toContain('Body')
  })
})

// ─── Builder — Messaging Formats ───────────────────────────────────────────

describe('builder — messaging formats', () => {
  it('toSlack produces valid JSON', async () => {
    const result = await createDocument()
      .heading('Alert')
      .text('Something happened.')
      .toSlack()
    const parsed = JSON.parse(result as string)
    expect(parsed.blocks).toBeDefined()
  })

  it('toDiscord produces embed JSON', async () => {
    const result = await createDocument()
      .heading('Update')
      .text('New version released.')
      .toDiscord()
    const parsed = JSON.parse(result as string)
    expect(parsed.embeds).toBeDefined()
  })

  it('toTelegram produces HTML string', async () => {
    const result = await createDocument()
      .heading('Notice')
      .text('Please read.')
      .toTelegram()
    expect(result).toContain('<b>Notice</b>')
  })

  it('toSvg produces SVG string', async () => {
    const result = await createDocument()
      .heading('Chart Title')
      .toSvg()
    expect(result).toContain('<svg')
  })
})

// ─── Cross-Format Consistency ──────────────────────────────────────────────

describe('cross-format consistency', () => {
  const invoice = Document({
    title: 'Invoice',
    children: Page({
      children: [
        Heading({ children: 'Invoice #42' }),
        Table({
          columns: ['Item', 'Price'],
          rows: [['Widget', '$10'], ['Gadget', '$20']],
        }),
        Text({ bold: true, children: 'Total: $30' }),
      ],
    }),
  })

  it('all text formats contain the same content', async () => {
    const html = (await render(invoice, 'html')) as string
    const md = (await render(invoice, 'md')) as string
    const text = (await render(invoice, 'text')) as string
    const email = (await render(invoice, 'email')) as string

    for (const output of [html, md, email]) {
      expect(output).toContain('Invoice')
      expect(output).toContain('Widget')
      expect(output).toContain('$10')
    }
    // Text renderer uppercases headings
    expect(text).toContain('INVOICE')
    expect(text).toContain('Widget')
    expect(text).toContain('$10')
  })
})

// ─── Builder — add() and section() ─────────────────────────────────────────

describe('builder — add and section', () => {
  it('add() accepts a single node', () => {
    const doc = createDocument().add(Heading({ children: 'Added' }))
    const node = doc.build()
    expect(node.type).toBe('document')
  })

  it('add() accepts an array of nodes', () => {
    const doc = createDocument().add([
      Text({ children: 'A' }),
      Text({ children: 'B' }),
    ])
    const node = doc.build()
    expect(node.type).toBe('document')
  })

  it('section() wraps children in a Section node', async () => {
    const doc = createDocument().section([
      Text({ children: 'inside section' }),
    ])
    const html = await doc.toHtml()
    expect(html).toContain('inside section')
  })
})

// ─── Document Metadata Pass-Through (PR #197) ──────────────────────────────
//
// Verifies that `title`, `author`, and `subject` from a Document
// node actually reach the rendered output for each format. Before
// PR #197, only the PDF renderer consumed these fields — DOCX, HTML
// (author/subject), and Markdown all silently dropped them. The
// resume builder shipped with metadata that worked in PDF only.
//
// These tests are end-to-end: they construct a Document via the
// public factory, render it to each format, and assert on the
// rendered string for the metadata. If any renderer regresses, the
// corresponding test fails immediately.

describe('document metadata pass-through (PR #197)', () => {
  const doc = Document({
    title: 'My Report',
    author: 'Alice Smith',
    subject: 'Q4 Sales Analysis',
    children: Page({
      children: [Heading({ children: 'Sales' }), Text({ children: 'Body content' })],
    }),
  })

  it('HTML renderer emits <title>, <meta name="author">, and <meta name="description">', async () => {
    const html = (await render(doc, 'html')) as string
    expect(html).toContain('<title>My Report</title>')
    expect(html).toContain('<meta name="author" content="Alice Smith">')
    expect(html).toContain('<meta name="description" content="Q4 Sales Analysis">')
  })

  it('HTML omits author/description meta tags when fields are missing', async () => {
    const minimal = Document({
      title: 'Just a title',
      children: Page({ children: [Text({ children: 'x' })] }),
    })
    const html = (await render(minimal, 'html')) as string
    expect(html).toContain('<title>Just a title</title>')
    expect(html).not.toContain('<meta name="author"')
    expect(html).not.toContain('<meta name="description"')
  })

  it('HTML escapes metadata to prevent XSS', async () => {
    // Metadata strings come from user data — they MUST be escaped.
    // The HTML renderer uses escapeHtml on every metadata field.
    const xssDoc = Document({
      title: '<script>alert(1)</script>',
      author: '"><script>alert(2)</script>',
      subject: 'Has & < > characters',
      children: Page({ children: [Text({ children: 'x' })] }),
    })
    const html = (await render(xssDoc, 'html')) as string
    // No raw <script> tags
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).not.toContain('<script>alert(2)</script>')
    // The escaped form is present
    expect(html).toContain('&lt;script&gt;')
    // The & < > in subject are also escaped
    expect(html).toContain('Has &amp; &lt; &gt; characters')
  })

  it('Markdown emits YAML frontmatter when metadata is present', async () => {
    const md = (await render(doc, 'md')) as string
    // YAML frontmatter at the very start
    expect(md.startsWith('---\n')).toBe(true)
    expect(md).toContain('title: "My Report"')
    expect(md).toContain('author: "Alice Smith"')
    expect(md).toContain('description: "Q4 Sales Analysis"')
    // Closes the frontmatter block before the body content
    expect(md).toMatch(/---\n# Sales/)
  })

  it('Markdown omits frontmatter entirely when no metadata is present', async () => {
    const noMeta = Document({
      children: Page({ children: [Heading({ children: 'No metadata here' })] }),
    })
    const md = (await render(noMeta, 'md')) as string
    expect(md.startsWith('---')).toBe(false)
    expect(md).toContain('# No metadata here')
  })

  it('Markdown escapes quotes in YAML frontmatter strings', async () => {
    // YAML double-quoted scalars need backslash-escaping for "
    // and \. The yamlString helper handles this.
    const escapeDoc = Document({
      title: 'Has "quotes" and \\backslash',
      children: Page({ children: [Text({ children: 'x' })] }),
    })
    const md = (await render(escapeDoc, 'md')) as string
    expect(md).toContain('title: "Has \\"quotes\\" and \\\\backslash"')
  })

  it('Markdown emits frontmatter even with only ONE metadata field', async () => {
    const titleOnly = Document({
      title: 'Just a title',
      children: Page({ children: [Text({ children: 'x' })] }),
    })
    const md = (await render(titleOnly, 'md')) as string
    expect(md).toContain('---\ntitle: "Just a title"\n---')
    expect(md).not.toContain('author:')
    expect(md).not.toContain('description:')
  })

  it('PDF renderer writes metadata to the /Info dictionary (binary verified)', async () => {
    // End-to-end binary verification. The PDF renderer was already
    // correct (it consumed these fields before PR #197), but we
    // never proved it by actually inspecting a generated PDF.
    //
    // PDFs store document metadata in an /Info dictionary in the
    // trailer, with each field as an indirect object reference:
    //
    //   11 0 obj
    //   << /Title 15 0 R /Author 16 0 R /Subject 17 0 R /Keywords 18 0 R ... >>
    //   endobj
    //   15 0 obj (My Title) endobj
    //   16 0 obj (Alice Author) endobj
    //
    // We decode the PDF bytes as Latin-1 (the safe encoding for
    // PDF stream payloads) and assert on the structural patterns
    // AND the literal metadata strings. If pdfmake's `info` config
    // ever stops producing these objects, this test catches it.
    const docWithKeywords = Document({
      title: 'My Report',
      author: 'Alice Smith',
      subject: 'Q4 Sales Analysis',
      keywords: ['sales', 'q4', 'report'],
      children: Page({
        children: [Heading({ children: 'Sales' }), Text({ children: 'Body content' })],
      }),
    })

    const bytes = (await render(docWithKeywords, 'pdf')) as Uint8Array
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.byteLength).toBeGreaterThan(0)

    // Decode the entire PDF as latin-1 — PDFs are mostly ASCII +
    // FlateDecoded streams. The /Info dictionary references and
    // the string literal objects are in the uncompressed portion.
    const text = new TextDecoder('latin1').decode(bytes)

    // The /Info dictionary references all four metadata fields
    expect(text).toMatch(/\/Title\s+\d+\s+0\s+R/)
    expect(text).toMatch(/\/Author\s+\d+\s+0\s+R/)
    expect(text).toMatch(/\/Subject\s+\d+\s+0\s+R/)
    expect(text).toMatch(/\/Keywords\s+\d+\s+0\s+R/)

    // The literal metadata values appear in the indirect objects
    expect(text).toContain('(My Report)')
    expect(text).toContain('(Alice Smith)')
    expect(text).toContain('(Q4 Sales Analysis)')
    expect(text).toContain('(sales, q4, report)')
  })

  it('DOCX renderer writes metadata to docProps/core.xml (binary verified)', async () => {
    // End-to-end binary verification. PR #197 added the metadata
    // pass-through to the DOCX renderer, but we shouldn't trust
    // the docx library's docs without proof. This test:
    //
    //   1. Generates a real .docx (which is just a zip)
    //   2. Uses the system `unzip` tool to extract docProps/core.xml
    //   3. Asserts the OOXML CoreProperties XML contains the
    //      expected dc:* and cp:* elements
    //
    // The OOXML CoreProperties schema:
    //   • <dc:title>     — title (Dublin Core)
    //   • <dc:creator>   — author (DC's term for "creator")
    //   • <dc:subject>   — subject
    //   • <cp:keywords>  — keywords (OOXML core-properties extension)
    //
    // If the docx library ever stops writing these to core.xml, or
    // if my mapping (`author → creator`, `keywords[] → joined`)
    // breaks, this test catches it.
    const { spawnSync } = await import('node:child_process')
    const { writeFileSync, mkdtempSync, rmSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')

    const docWithKeywords = Document({
      title: 'My Report',
      author: 'Alice Smith',
      subject: 'Q4 Sales Analysis',
      keywords: ['sales', 'q4', 'report'],
      children: Page({
        children: [Heading({ children: 'Sales' }), Text({ children: 'Body content' })],
      }),
    })

    const bytes = (await render(docWithKeywords, 'docx')) as Uint8Array
    expect(bytes.byteLength).toBeGreaterThan(0)

    // Write the .docx to a temp dir and unzip docProps/core.xml.
    // `unzip -p` writes a single entry to stdout — no on-disk
    // extraction of the rest of the archive.
    const tmp = mkdtempSync(join(tmpdir(), 'pyreon-docx-test-'))
    try {
      const docxPath = join(tmp, 'out.docx')
      writeFileSync(docxPath, bytes)

      const result = spawnSync('unzip', ['-p', docxPath, 'docProps/core.xml'], {
        encoding: 'utf8',
        timeout: 10_000,
      })

      if (result.error || result.status !== 0) {
        throw new Error(
          `Failed to unzip docProps/core.xml: ${result.error?.message ?? result.stderr}. ` +
            `This test requires the system 'unzip' tool on PATH.`,
        )
      }

      const coreXml = result.stdout
      expect(coreXml).toContain('<dc:title>My Report</dc:title>')
      expect(coreXml).toContain('<dc:creator>Alice Smith</dc:creator>')
      expect(coreXml).toContain('<dc:subject>Q4 Sales Analysis</dc:subject>')
      expect(coreXml).toContain('<cp:keywords>sales, q4, report</cp:keywords>')

      // Sanity: the namespace declarations are present
      expect(coreXml).toContain('xmlns:dc="http://purl.org/dc/elements/1.1/"')
      expect(coreXml).toContain(
        'xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"',
      )
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('DOCX renderer omits empty metadata elements when fields are missing', async () => {
    // Regression case for the conditional spread pattern in the
    // renderer: a Document with only `title` set should produce a
    // core.xml that has <dc:title> but NOT empty <dc:creator> or
    // <dc:subject> elements. The docx library is well-behaved
    // about omitting unset fields, but if our renderer code ever
    // changed from `?... :{}` spreads to always-include with
    // empty defaults, this test catches it.
    const { spawnSync } = await import('node:child_process')
    const { writeFileSync, mkdtempSync, rmSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')

    const titleOnly = Document({
      title: 'Just a title',
      children: Page({ children: [Text({ children: 'x' })] }),
    })

    const bytes = (await render(titleOnly, 'docx')) as Uint8Array
    const tmp = mkdtempSync(join(tmpdir(), 'pyreon-docx-test-'))
    try {
      const docxPath = join(tmp, 'out.docx')
      writeFileSync(docxPath, bytes)
      const result = spawnSync('unzip', ['-p', docxPath, 'docProps/core.xml'], {
        encoding: 'utf8',
      })
      const coreXml = result.stdout

      expect(coreXml).toContain('<dc:title>Just a title</dc:title>')
      // Empty creator/subject/keywords elements should NOT appear
      expect(coreXml).not.toMatch(/<dc:creator><\/dc:creator>/)
      expect(coreXml).not.toMatch(/<dc:subject><\/dc:subject>/)
      expect(coreXml).not.toMatch(/<cp:keywords><\/cp:keywords>/)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
