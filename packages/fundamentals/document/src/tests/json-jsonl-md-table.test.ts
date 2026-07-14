import { afterEach, describe, expect, it } from 'vitest'
import {
  _resetRenderers,
  Code,
  createDocument,
  Divider,
  Document,
  Heading,
  Image,
  List,
  ListItem,
  Page,
  Section,
  Table,
  Text,
  render,
} from '../index'

afterEach(() => {
  _resetRenderers()
})

// ─── json format ─────────────────────────────────────────────────────────────

describe('json renderer', () => {
  it('serializes the DocNode tree to pretty JSON', async () => {
    const doc = Document({
      title: 'Report',
      author: 'Team',
      children: [Page({ children: [Heading({ level: 1, children: 'Hello' })] })],
    })
    const json = (await render(doc, 'json')) as string
    const parsed = JSON.parse(json)
    expect(parsed.type).toBe('document')
    expect(parsed.props.title).toBe('Report')
    expect(parsed.props.author).toBe('Team')
    // Pretty-printed (2-space indent)
    expect(json).toContain('\n  "type"')
  })

  it('round-trips: JSON.parse(json) renders identically in another format', async () => {
    const doc = Document({
      title: 'RT',
      children: [
        Page({
          children: [
            Heading({ level: 2, children: 'Section' }),
            Text({ bold: true, children: 'Bold body' }),
            Table({ columns: ['A', 'B'], rows: [['1', '2']] }),
          ],
        }),
      ],
    })
    const html = (await render(doc, 'html')) as string
    const json = (await render(doc, 'json')) as string
    const roundTripped = JSON.parse(json)
    const htmlFromRoundTrip = (await render(roundTripped, 'html')) as string
    expect(htmlFromRoundTrip).toBe(html)
  })

  it('handles an empty document', async () => {
    const json = (await render(Document({ children: [] }), 'json')) as string
    expect(JSON.parse(json)).toEqual({ type: 'document', props: {}, children: [] })
  })
})

// ─── jsonl format ────────────────────────────────────────────────────────────

describe('jsonl renderer', () => {
  it('emits one content block per line, flattening structural containers', async () => {
    const doc = Document({
      children: [
        Page({
          children: [
            Section({
              children: [
                Heading({ level: 1, children: 'Title' }),
                Text({ children: 'Paragraph.' }),
              ],
            }),
            Divider({}),
          ],
        }),
      ],
    })
    const jsonl = (await render(doc, 'jsonl')) as string
    const lines = jsonl.split('\n')
    // document / page / section are containers → not emitted
    expect(lines).toHaveLength(3)
    const blocks = lines.map((l) => JSON.parse(l))
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'text', 'divider'])
    expect(blocks[0]).toMatchObject({ type: 'heading', level: 1, text: 'Title' })
    expect(blocks[1]).toMatchObject({ type: 'text', text: 'Paragraph.' })
  })

  it('every line is independently valid JSON', async () => {
    const doc = Document({
      children: [
        Page({
          children: [
            Text({ children: 'Line with "quotes" and \n newline' }),
            Code({ language: 'ts', children: 'const x = 1' }),
          ],
        }),
      ],
    })
    const jsonl = (await render(doc, 'jsonl')) as string
    for (const line of jsonl.split('\n')) {
      expect(() => JSON.parse(line)).not.toThrow()
    }
  })

  it('flattens list children into a string[] items array', async () => {
    const doc = Document({
      children: [
        Page({
          children: [
            List({
              ordered: true,
              children: [ListItem({ children: 'one' }), ListItem({ children: 'two' })],
            }),
          ],
        }),
      ],
    })
    const jsonl = (await render(doc, 'jsonl')) as string
    const block = JSON.parse(jsonl)
    expect(block).toMatchObject({ type: 'list', ordered: true, items: ['one', 'two'] })
    // list does NOT also get a concatenated `text`
    expect(block.text).toBeUndefined()
  })

  it('carries table columns/rows and image props through to the block', async () => {
    const doc = Document({
      children: [
        Page({
          children: [
            Table({ columns: ['A'], rows: [['x']] }),
            Image({ src: 'https://cdn/logo.png', alt: 'logo' }),
          ],
        }),
      ],
    })
    const [table, image] = (
      ((await render(doc, 'jsonl')) as string).split('\n')
    ).map((l) => JSON.parse(l))
    expect(table).toMatchObject({ type: 'table', columns: ['A'], rows: [['x']] })
    expect(image).toMatchObject({ type: 'image', src: 'https://cdn/logo.png', alt: 'logo' })
  })

  it('returns empty string for a document with no content blocks', async () => {
    expect(await render(Document({ children: [] }), 'jsonl')).toBe('')
  })

  it('is re-registered by _resetRenderers (both json and jsonl loaders)', async () => {
    _resetRenderers()
    const doc = Document({ children: [Page({ children: [Heading({ children: 'X' })] })] })
    expect(JSON.parse((await render(doc, 'json')) as string).type).toBe('document')
    expect(JSON.parse((await render(doc, 'jsonl')) as string).type).toBe('heading')
  })
})

// ─── builder integration ─────────────────────────────────────────────────────

describe('builder toJson / toJsonl', () => {
  it('produces the same output as render()', async () => {
    const builder = createDocument({ title: 'B' })
      .heading('H')
      .text('T')
      .table({ columns: ['A'], rows: [['1']] })
    const node = builder.build()
    expect(await builder.toJson()).toBe(await render(node, 'json'))
    expect(await builder.toJsonl()).toBe(await render(node, 'jsonl'))
  })
})

// ─── markdown table escaping (regression) ────────────────────────────────────

describe('markdown table — cell escaping', () => {
  it('escapes a literal pipe so the column structure is not corrupted', async () => {
    const doc = Document({
      children: [
        Page({ children: [Table({ columns: ['A | pipe', 'B'], rows: [['x | y', 'z']] })] }),
      ],
    })
    const md = (await render(doc, 'md')) as string
    const tableLines = md.split('\n').filter((l) => l.startsWith('|'))
    // Header + separator + one row = 3 lines
    expect(tableLines).toHaveLength(3)
    // Each line must have exactly 2 UNESCAPED pipe-delimited cells → 3 leading
    // `|` structural bars (start, middle, end). A raw pipe would add a 4th.
    for (const line of tableLines) {
      const structuralBars = line.match(/(?<!\\)\|/g) ?? []
      expect(structuralBars).toHaveLength(3)
    }
    expect(md).toContain('A \\| pipe')
    expect(md).toContain('x \\| y')
  })

  it('collapses newlines in a cell to <br> so the row is not broken', async () => {
    const doc = Document({
      children: [
        Page({ children: [Table({ columns: ['A', 'B'], rows: [['line1\nline2', 'w']] })] }),
      ],
    })
    const md = (await render(doc, 'md')) as string
    const tableLines = md.split('\n').filter((l) => l.startsWith('|'))
    expect(tableLines).toHaveLength(3) // no extra line from the embedded newline
    expect(md).toContain('line1<br>line2')
  })

  it('escapes backslash before pipe so an author-supplied \\| survives', async () => {
    const doc = Document({
      children: [Page({ children: [Table({ columns: ['A'], rows: [['a\\|b']] })] })],
    })
    const md = (await render(doc, 'md')) as string
    // backslash doubled, pipe escaped → GFM renders literal `a\|b`
    expect(md).toContain('a\\\\\\|b')
  })
})
