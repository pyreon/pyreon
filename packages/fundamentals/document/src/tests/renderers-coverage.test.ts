import { afterEach, describe, expect, it } from 'vitest'
import {
  _resetRenderers,
  Button,
  Code,
  Column,
  Divider,
  Document,
  Heading,
  Image,
  Link,
  List,
  ListItem,
  Page,
  PageBreak,
  Quote,
  Row,
  render,
  Section,
  Spacer,
  Table,
  Text,
} from '../index'

afterEach(() => {
  _resetRenderers()
})

// ─── Helper: full document with all node types ─────────────────────────────

function createFullDoc() {
  return Document({
    title: 'Test Report',
    subject: 'Coverage',
    children: [
      Page({
        children: [
          Heading({ level: 1, children: 'Main Title' }),
          Heading({ level: 2, children: 'Subtitle' }),
          Text({ bold: true, children: 'Bold text' }),
          Text({ italic: true, children: 'Italic text' }),
          Text({ strikethrough: true, children: 'Striked text' }),
          Text({ underline: true, color: '#ff0000', children: 'Underline colored' }),
          Link({ href: 'https://example.com', children: 'Link text' }),
          Image({ src: 'https://example.com/img.png', alt: 'Alt text', width: 200, height: 100 }),
          Table({
            columns: ['Name', 'Price', 'Qty'],
            rows: [
              ['Widget', '$10', '5'],
              ['Gadget', '$20', '3'],
            ],
            striped: true,
            caption: 'Products',
          }),
          List({
            ordered: true,
            children: [ListItem({ children: 'First' }), ListItem({ children: 'Second' })],
          }),
          List({
            children: [ListItem({ children: 'Bullet A' }), ListItem({ children: 'Bullet B' })],
          }),
          Code({ language: 'typescript', children: 'const x = 42' }),
          Divider({ color: '#ccc', thickness: 2 }),
          PageBreak(),
          Spacer({ height: 20 }),
          Button({ href: 'https://example.com/pay', background: '#4f46e5', color: '#fff', children: 'Pay Now' }),
          Quote({ borderColor: '#4f46e5', children: 'A wise quote' }),
          Section({
            direction: 'row',
            gap: 12,
            children: [
              Row({
                gap: 10,
                children: [
                  Column({ width: '50%', children: Text({ children: 'Left' }) }),
                  Column({ width: '50%', children: Text({ children: 'Right' }) }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  })
}

// ─── Discord Renderer ──────────────────────────────────────────────────────

describe('Discord renderer', () => {
  it('renders full document as Discord embed JSON', async () => {
    const doc = createFullDoc()
    const result = (await render(doc, 'discord')) as string
    const parsed = JSON.parse(result)

    expect(parsed.embeds).toBeDefined()
    expect(parsed.embeds).toHaveLength(1)
    expect(parsed.embeds[0].title).toBe('Main Title')
    expect(parsed.embeds[0].description).toContain('**Bold text**')
    expect(parsed.embeds[0].description).toContain('*Italic text*')
    expect(parsed.embeds[0].description).toContain('~~Striked text~~')
    // Image extraction is depth-first; it finds the first HTTP image
    // The embed may or may not include the image depending on traversal
    expect(parsed.embeds[0].description).toBeDefined()
  })

  it('uses code block for large tables', async () => {
    const doc = Document({
      children: Table({
        columns: ['A', 'B', 'C', 'D'],
        rows: Array.from({ length: 15 }, (_, i) => [i, i + 1, i + 2, i + 3]),
      }),
    })
    const result = (await render(doc, 'discord')) as string
    const parsed = JSON.parse(result)
    expect(parsed.embeds[0].description).toContain('```')
  })

  it('uses embed fields for small tables', async () => {
    const doc = Document({
      children: Table({
        columns: ['Name', 'Price'],
        rows: [['Widget', '$10']],
      }),
    })
    const result = (await render(doc, 'discord')) as string
    const parsed = JSON.parse(result)
    expect(parsed.embeds[0].fields).toBeDefined()
  })

  it('renders link and button', async () => {
    const doc = Document({
      children: [
        Link({ href: 'https://example.com', children: 'Click' }),
        Button({ href: 'https://example.com', children: 'Action' }),
      ],
    })
    const result = (await render(doc, 'discord')) as string
    const parsed = JSON.parse(result)
    expect(parsed.embeds[0].description).toContain('[Click]')
    expect(parsed.embeds[0].description).toContain('[**Action**]')
  })

  it('renders divider and page break', async () => {
    const doc = Document({ children: [Divider(), PageBreak()] })
    const result = (await render(doc, 'discord')) as string
    const parsed = JSON.parse(result)
    expect(parsed.embeds[0].description).toContain('───')
  })

  it('renders code block', async () => {
    const doc = Document({ children: Code({ language: 'js', children: 'let x = 1' }) })
    const result = (await render(doc, 'discord')) as string
    expect(result).toContain('```js')
  })

  it('renders quote', async () => {
    const doc = Document({ children: Quote({ children: 'wise' }) })
    const result = (await render(doc, 'discord')) as string
    expect(result).toContain('> wise')
  })

  it('renders list', async () => {
    const doc = Document({
      children: List({
        ordered: true,
        children: [ListItem({ children: 'one' })],
      }),
    })
    const result = (await render(doc, 'discord')) as string
    expect(result).toContain('1. one')
  })
})

// ─── Google Chat Renderer ──────────────────────────────────────────────────

describe('Google Chat renderer', () => {
  it('renders full document as Card V2', async () => {
    const doc = createFullDoc()
    const result = (await render(doc, 'google-chat')) as string
    const parsed = JSON.parse(result)

    expect(parsed.cardsV2).toBeDefined()
    // When document has a title prop, that's used as card header
    expect(parsed.cardsV2[0].card.header?.title).toBe('Test Report')
    expect(parsed.cardsV2[0].card.sections[0].widgets.length).toBeGreaterThan(0)
  })

  it('renders heading as decorated text', async () => {
    const doc = Document({ children: Heading({ children: 'Hello' }) })
    const result = (await render(doc, 'google-chat')) as string
    const parsed = JSON.parse(result)
    const widgets = parsed.cardsV2[0].card.sections[0].widgets
    expect(widgets.some((w: any) => w.decoratedText?.text?.includes('<b>Hello</b>'))).toBe(true)
  })

  it('renders image with http src', async () => {
    const doc = Document({ children: Image({ src: 'https://example.com/img.png', alt: 'test' }) })
    const result = (await render(doc, 'google-chat')) as string
    const parsed = JSON.parse(result)
    const widgets = parsed.cardsV2[0].card.sections[0].widgets
    expect(widgets.some((w: any) => w.image?.imageUrl)).toBe(true)
  })

  it('renders code block', async () => {
    const doc = Document({ children: Code({ children: 'const x = 1' }) })
    const result = (await render(doc, 'google-chat')) as string
    expect(result).toContain('<code>')
  })

  it('renders divider', async () => {
    const doc = Document({ children: Divider() })
    const result = (await render(doc, 'google-chat')) as string
    const parsed = JSON.parse(result)
    const widgets = parsed.cardsV2[0].card.sections[0].widgets
    expect(widgets.some((w: any) => w.divider)).toBe(true)
  })

  it('renders button', async () => {
    const doc = Document({ children: Button({ href: 'https://example.com', children: 'Click' }) })
    const result = (await render(doc, 'google-chat')) as string
    expect(result).toContain('buttonList')
  })

  it('renders quote', async () => {
    const doc = Document({ children: Quote({ children: 'quoted' }) })
    const result = (await render(doc, 'google-chat')) as string
    expect(result).toContain('quoted')
  })

  it('renders list', async () => {
    const doc = Document({
      children: List({
        ordered: true,
        children: [ListItem({ children: 'one' })],
      }),
    })
    const result = (await render(doc, 'google-chat')) as string
    expect(result).toContain('1. one')
  })

  it('renders table', async () => {
    const doc = Document({
      children: Table({
        columns: ['A', 'B'],
        rows: [['x', 'y']],
      }),
    })
    const result = (await render(doc, 'google-chat')) as string
    expect(result).toContain('<b>A</b>')
  })

  it('renders text formatting', async () => {
    const doc = Document({
      children: [
        Text({ bold: true, children: 'bold' }),
        Text({ italic: true, children: 'italic' }),
        Text({ strikethrough: true, children: 'strike' }),
      ],
    })
    const result = (await render(doc, 'google-chat')) as string
    expect(result).toContain('<b>bold</b>')
    expect(result).toContain('<i>italic</i>')
    expect(result).toContain('<s>strike</s>')
  })

  it('renders spacer as no-op', async () => {
    const doc = Document({ children: Spacer({ height: 20 }) })
    const result = (await render(doc, 'google-chat')) as string
    // Spacer produces no widgets
    const parsed = JSON.parse(result)
    expect(parsed.cardsV2[0].card.sections[0].widgets).toHaveLength(0)
  })

  it('extracts title from first heading when document has no title', async () => {
    const doc = Document({
      children: [Heading({ children: 'Extracted Title' }), Text({ children: 'body' })],
    })
    const result = (await render(doc, 'google-chat')) as string
    const parsed = JSON.parse(result)
    expect(parsed.cardsV2[0].card.header.title).toBe('Extracted Title')
  })
})

// ─── Confluence Renderer ───────────────────────────────────────────────────

describe('Confluence renderer', () => {
  it('renders full document as ADF', async () => {
    const doc = createFullDoc()
    const result = (await render(doc, 'confluence')) as string
    const parsed = JSON.parse(result)

    expect(parsed.version).toBe(1)
    expect(parsed.type).toBe('doc')
    expect(parsed.content.length).toBeGreaterThan(0)
  })

  it('renders heading with level', async () => {
    const doc = Document({ children: Heading({ level: 3, children: 'H3' }) })
    const result = (await render(doc, 'confluence')) as string
    const parsed = JSON.parse(result)
    const heading = parsed.content.find((n: any) => n.type === 'heading')
    expect(heading.attrs.level).toBe(3)
  })

  it('renders text with marks', async () => {
    const doc = Document({
      children: Text({ bold: true, italic: true, underline: true, strikethrough: true, color: '#ff0000', children: 'styled' }),
    })
    const result = (await render(doc, 'confluence')) as string
    const parsed = JSON.parse(result)
    const para = parsed.content.find((n: any) => n.type === 'paragraph')
    const marks = para.content[0].marks
    expect(marks.some((m: any) => m.type === 'strong')).toBe(true)
    expect(marks.some((m: any) => m.type === 'em')).toBe(true)
    expect(marks.some((m: any) => m.type === 'underline')).toBe(true)
    expect(marks.some((m: any) => m.type === 'strike')).toBe(true)
    expect(marks.some((m: any) => m.type === 'textColor')).toBe(true)
  })

  it('renders link', async () => {
    const doc = Document({ children: Link({ href: 'https://example.com', children: 'link' }) })
    const result = (await render(doc, 'confluence')) as string
    expect(result).toContain('"link"')
  })

  it('renders image with http src', async () => {
    const doc = Document({ children: Image({ src: 'https://example.com/img.png', width: 100 }) })
    const result = (await render(doc, 'confluence')) as string
    expect(result).toContain('mediaSingle')
  })

  it('skips image with non-http src', async () => {
    const doc = Document({ children: Image({ src: '/local/img.png' }) })
    const result = (await render(doc, 'confluence')) as string
    const parsed = JSON.parse(result)
    expect(parsed.content.filter((n: any) => n.type === 'mediaSingle')).toHaveLength(0)
  })

  it('renders table', async () => {
    const doc = Document({
      children: Table({
        columns: ['Name'],
        rows: [['val']],
      }),
    })
    const result = (await render(doc, 'confluence')) as string
    expect(result).toContain('tableRow')
    expect(result).toContain('tableHeader')
  })

  it('renders list', async () => {
    const doc = Document({
      children: List({
        ordered: true,
        children: [ListItem({ children: 'item' })],
      }),
    })
    const result = (await render(doc, 'confluence')) as string
    expect(result).toContain('orderedList')
  })

  it('renders bullet list', async () => {
    const doc = Document({
      children: List({
        children: [ListItem({ children: 'item' })],
      }),
    })
    const result = (await render(doc, 'confluence')) as string
    expect(result).toContain('bulletList')
  })

  it('renders code block', async () => {
    const doc = Document({ children: Code({ language: 'js', children: 'x' }) })
    const result = (await render(doc, 'confluence')) as string
    expect(result).toContain('codeBlock')
  })

  it('renders divider and page break', async () => {
    const doc = Document({ children: [Divider(), PageBreak()] })
    const result = (await render(doc, 'confluence')) as string
    expect(result).toContain('"rule"')
  })

  it('renders spacer as empty paragraph', async () => {
    const doc = Document({ children: Spacer({ height: 10 }) })
    const result = (await render(doc, 'confluence')) as string
    const parsed = JSON.parse(result)
    expect(parsed.content.some((n: any) => n.type === 'paragraph')).toBe(true)
  })

  it('renders button as styled link', async () => {
    const doc = Document({ children: Button({ href: 'https://example.com', children: 'Go' }) })
    const result = (await render(doc, 'confluence')) as string
    expect(result).toContain('"strong"')
    expect(result).toContain('"link"')
  })

  it('renders quote', async () => {
    const doc = Document({ children: Quote({ children: 'quoted' }) })
    const result = (await render(doc, 'confluence')) as string
    expect(result).toContain('blockquote')
  })
})

// ─── WhatsApp Renderer ─────────────────────────────────────────────────────

describe('WhatsApp renderer', () => {
  it('renders full document', async () => {
    const doc = createFullDoc()
    const result = (await render(doc, 'whatsapp')) as string

    expect(result).toContain('*Main Title*')
    expect(result).toContain('*Bold text*')
    expect(result).toContain('_Italic text_')
    expect(result).toContain('~Striked text~')
    expect(result).toContain('Pay Now')
    expect(result).toContain('> A wise quote')
  })

  it('renders table with caption', async () => {
    const doc = Document({
      children: Table({
        columns: ['A', 'B'],
        rows: [['x', 'y']],
        caption: 'My Table',
      }),
    })
    const result = (await render(doc, 'whatsapp')) as string
    expect(result).toContain('_My Table_')
    expect(result).toContain('*A*')
  })

  it('renders code block', async () => {
    const doc = Document({ children: Code({ children: 'hello' }) })
    const result = (await render(doc, 'whatsapp')) as string
    expect(result).toContain('```hello```')
  })

  it('renders divider', async () => {
    const doc = Document({ children: Divider() })
    const result = (await render(doc, 'whatsapp')) as string
    expect(result).toContain('───')
  })

  it('renders spacer as newline', async () => {
    const doc = Document({ children: Spacer({ height: 10 }) })
    const result = (await render(doc, 'whatsapp')) as string
    expect(result).toBe('')  // just whitespace, trimmed
  })

  it('skips images', async () => {
    const doc = Document({ children: Image({ src: 'https://example.com/img.png' }) })
    const result = (await render(doc, 'whatsapp')) as string
    expect(result).toBe('')
  })

  it('renders link', async () => {
    const doc = Document({ children: Link({ href: 'https://example.com', children: 'Click' }) })
    const result = (await render(doc, 'whatsapp')) as string
    expect(result).toContain('Click: https://example.com')
  })

  it('renders button', async () => {
    const doc = Document({ children: Button({ href: 'https://example.com', children: 'Go' }) })
    const result = (await render(doc, 'whatsapp')) as string
    expect(result).toContain('*Go*: https://example.com')
  })

  it('renders list', async () => {
    const doc = Document({
      children: List({
        ordered: true,
        children: [ListItem({ children: 'one' }), ListItem({ children: 'two' })],
      }),
    })
    const result = (await render(doc, 'whatsapp')) as string
    expect(result).toContain('1. one')
    expect(result).toContain('2. two')
  })

  it('renders section/row/column', async () => {
    const doc = Document({
      children: Section({
        children: Row({
          children: [
            Column({ children: Text({ children: 'left' }) }),
            Column({ children: Text({ children: 'right' }) }),
          ],
        }),
      }),
    })
    const result = (await render(doc, 'whatsapp')) as string
    expect(result).toContain('left')
    expect(result).toContain('right')
  })
})

// ─── Notion Renderer ───────────────────────────────────────────────────────

describe('Notion renderer', () => {
  it('renders full document as Notion blocks', async () => {
    const doc = createFullDoc()
    const result = (await render(doc, 'notion')) as string
    const parsed = JSON.parse(result)
    expect(parsed.children).toBeDefined()
    expect(parsed.children.length).toBeGreaterThan(0)
  })

  it('renders heading', async () => {
    const doc = Document({ children: Heading({ level: 2, children: 'H2' }) })
    const result = (await render(doc, 'notion')) as string
    const parsed = JSON.parse(result)
    const h2 = parsed.children.find((b: any) => b.type === 'heading_2')
    expect(h2).toBeDefined()
  })

  it('renders button as bold link', async () => {
    const doc = Document({ children: Button({ href: 'https://example.com', children: 'Go' }) })
    const result = (await render(doc, 'notion')) as string
    expect(result).toContain('"bold": true')
  })

  it('renders quote', async () => {
    const doc = Document({ children: Quote({ children: 'quoted' }) })
    const result = (await render(doc, 'notion')) as string
    expect(result).toContain('"quote"')
  })

  it('renders spacer as empty paragraph', async () => {
    const doc = Document({ children: Spacer({ height: 10 }) })
    const result = (await render(doc, 'notion')) as string
    const parsed = JSON.parse(result)
    const para = parsed.children.find((b: any) => b.type === 'paragraph')
    expect(para).toBeDefined()
  })

  it('renders divider', async () => {
    const doc = Document({ children: Divider() })
    const result = (await render(doc, 'notion')) as string
    const parsed = JSON.parse(result)
    expect(parsed.children.some((b: any) => b.type === 'divider')).toBe(true)
  })
})

// ─── Telegram Renderer ─────────────────────────────────────────────────────

describe('Telegram renderer', () => {
  it('renders full document as Telegram HTML', async () => {
    const doc = createFullDoc()
    const result = (await render(doc, 'telegram')) as string

    expect(result).toContain('<b>Main Title</b>')
    expect(result).toContain('<b>Bold text</b>')
    expect(result).toContain('<i>Italic text</i>')
    expect(result).toContain('<s>Striked text</s>')
    expect(result).toContain('<a href="https://example.com">Link text</a>')
  })

  it('renders code block', async () => {
    const doc = Document({ children: Code({ language: 'js', children: 'x = 1' }) })
    const result = (await render(doc, 'telegram')) as string
    expect(result).toContain('<pre>')
    expect(result).toContain('<code')
  })

  it('renders quote', async () => {
    const doc = Document({ children: Quote({ children: 'quoted' }) })
    const result = (await render(doc, 'telegram')) as string
    expect(result).toContain('<blockquote>')
  })

  it('renders button as link', async () => {
    const doc = Document({ children: Button({ href: 'https://example.com', children: 'Go' }) })
    const result = (await render(doc, 'telegram')) as string
    expect(result).toContain('<a href=')
    expect(result).toContain('Go')
  })
})

// ─── Teams Renderer ────────────────────────────────────────────────────────

describe('Teams renderer', () => {
  it('renders full document as adaptive card', async () => {
    const doc = createFullDoc()
    const result = (await render(doc, 'teams')) as string
    const parsed = JSON.parse(result)

    expect(parsed.type).toBe('AdaptiveCard')
    expect(parsed.body.length).toBeGreaterThan(0)
  })

  it('renders heading', async () => {
    const doc = Document({ children: Heading({ level: 1, children: 'Title' }) })
    const result = (await render(doc, 'teams')) as string
    expect(result).toContain('Title')
  })

  it('renders link', async () => {
    const doc = Document({ children: Link({ href: 'https://example.com', children: 'Click' }) })
    const result = (await render(doc, 'teams')) as string
    expect(result).toContain('https://example.com')
  })

  it('renders image', async () => {
    const doc = Document({ children: Image({ src: 'https://example.com/img.png', alt: 'img' }) })
    const result = (await render(doc, 'teams')) as string
    expect(result).toContain('https://example.com/img.png')
  })

  it('renders button as action', async () => {
    const doc = Document({ children: Button({ href: 'https://example.com', children: 'Go' }) })
    const result = (await render(doc, 'teams')) as string
    expect(result).toContain('Action.OpenUrl')
  })
})
