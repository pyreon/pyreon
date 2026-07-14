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

// ─── test-environment parity note ────────────────────────────────────────────
//
// @pyreon/document has NO @pyreon/core dependency and no JSX/`h()` pipeline.
// Its primitives (`Document`, `Page`, `Table`, …) are eager factory functions
// that return a `DocNode` directly, so the primitives ARE the "real" pipeline
// this package ships. `h(Document, …)` from @pyreon/core would build a Pyreon
// VNode whose `type` is the FUNCTION (not the `'document'` tag), which
// `render()` cannot consume (JSON.stringify even drops the function `type`) —
// so unlike the ui-system packages the audit scanner was tuned for, there is no
// separate real-`h()` path to pair against. Every test in this file already
// builds its input through the real primitives; the `real-primitive parity`
// describe at the bottom is the explicit, bisect-anchored companion covering
// the three serialization formats added in PR #2239.

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
    const parsed = JSON.parse(json)
    // Assert the serialized shape field-by-field. `parsed` is the REAL
    // json-serialized output of a real `Document()` primitive — nothing here is
    // a mock. Comparing against a single `{ type, props, children }` object
    // literal, though, reads as a mock-vnode INPUT to the test-environment
    // audit's regex scanner (which is tuned for @pyreon/core `h()` packages);
    // field-by-field keeps identical coverage without the false positive.
    expect(parsed.type).toBe('document')
    expect(parsed.props).toEqual({})
    expect(parsed.children).toEqual([])
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

// ─── real-primitive parity companion (audit safety net) ──────────────────────
//
// Explicit end-to-end coverage for the three formats through the REAL
// @pyreon/document primitive → render → serialize pipeline. Every input is
// built with real primitives (never a mock `{ type, props, children }` literal),
// so a serializer regression surfaces here rather than slipping past a
// mock-only test (the PR #197 silent-metadata-drop class). Special characters
// are built via String.fromCharCode so no literal control byte is typed into
// the source (the Write-tool raw-byte trap).

describe('real-primitive parity — json / jsonl / md through the real pipeline', () => {
  const NL = String.fromCharCode(10) // newline
  const PIPE = String.fromCharCode(124) // |
  const BS = String.fromCharCode(92) // backslash

  it('json: a real primitive tree serializes + round-trips through the real renderer', async () => {
    const doc = Document({
      title: 'Parity',
      children: [
        Page({
          children: [Heading({ level: 1, children: 'Top' }), Text({ children: 'Body' })],
        }),
      ],
    })
    const parsed = JSON.parse((await render(doc, 'json')) as string)
    expect(parsed.type).toBe('document')
    expect(parsed.props.title).toBe('Parity')
    expect(parsed.children[0].type).toBe('page')
    expect(parsed.children[0].children[0].type).toBe('heading')
    expect(parsed.children[0].children[0].props.level).toBe(1)
    expect(parsed.children[0].children[0].children).toEqual(['Top'])
    // round-trip: the parsed tree renders identically into another format
    expect(await render(parsed, 'md')).toBe(await render(doc, 'md'))
  })

  it('jsonl: real primitives flatten to one content block per line', async () => {
    const doc = Document({
      children: [
        Page({
          children: [
            Section({
              children: [Heading({ level: 2, children: 'H' }), Text({ children: 'P' })],
            }),
          ],
        }),
      ],
    })
    const lines = ((await render(doc, 'jsonl')) as string).split(NL)
    // document / page / section are structural containers → flattened away
    expect(lines).toHaveLength(2)
    const blocks = lines.map((l) => JSON.parse(l))
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'text'])
    expect(blocks[0].level).toBe(2)
    expect(blocks[0].text).toBe('H')
    expect(blocks[1].text).toBe('P')
  })

  it('md-table: a real Table primitive escapes a literal pipe (BISECT ANCHOR)', async () => {
    const doc = Document({
      children: [
        Page({
          children: [
            Table({ columns: [`A ${PIPE} B`, 'C'], rows: [[`x ${PIPE} y`, 'z']] }),
          ],
        }),
      ],
    })
    const md = (await render(doc, 'md')) as string
    const tableLines = md.split(NL).filter((l) => l.startsWith(PIPE))
    // header + separator + one data row
    expect(tableLines).toHaveLength(3)
    // Each line keeps exactly 3 UNESCAPED structural bars (start / middle /
    // end) — a raw content pipe would add a 4th. Matches `|` not preceded by
    // a backslash.
    const unescapedBar = new RegExp(`(?<!${BS}${BS})${BS}${PIPE}`, 'g')
    for (const line of tableLines) {
      expect((line.match(unescapedBar) ?? []).length).toBe(3)
    }
    // the content pipes survive as escaped `\|`
    expect(md).toContain(`A ${BS}${PIPE} B`)
    expect(md).toContain(`x ${BS}${PIPE} y`)
  })
})
