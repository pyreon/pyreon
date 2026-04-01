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
