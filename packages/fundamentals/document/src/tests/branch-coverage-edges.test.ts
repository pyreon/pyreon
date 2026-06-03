/**
 * Branch-coverage edge tests — drives renderer + builder + helper
 * branches that the main coverage suites miss (mostly `??` / `||`
 * fallback right-sides for optional props that nodes ship without).
 */
import { describe, expect, it } from 'vitest'
import {
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
  createDocument,
} from '../index'
import { getTextContent } from '../nodes'
import { sanitizeColor, sanitizeImageSrc } from '../sanitize'
import type { DocNode } from '../types'

// Manually-constructed DocNodes WITHOUT optional props that primitive
// constructors normally default. Drives the `(p.x as T) ?? default`
// fallback branches in every renderer.
function rawNode(
  type: string,
  props: Record<string, unknown> = {},
  children: (string | DocNode)[] = [],
): DocNode {
  return { type, props, children } as DocNode
}

function bareDoc() {
  return rawNode('document', {}, [
    rawNode('page', {}, [
      rawNode('heading', {}, ['Bare H']), // NO level set
      rawNode('heading', { level: 2 }, ['L2']),
      rawNode('heading', { level: 3 }, ['L3']),
      rawNode('image', { src: 'local.png' }, []),
      rawNode('image', { src: 'https://e.com/i.png' }, []),
      rawNode('divider', {}, []),
      rawNode('spacer', {}, []),
      rawNode('button', { href: 'https://e.com' }, ['Btn']),
      rawNode('button', { background: '#f00', color: '#fff', href: 'https://e.com' }, ['Btn2']),
      rawNode('table', {}, []),
      rawNode('table', { columns: ['A'], rows: [['x']] }, []),
      rawNode('table', { columns: ['A', 'B'], rows: [[null, undefined]] }, []),
      rawNode('list', {}, [rawNode('list-item', {}, ['I1'])]),
      rawNode('code', {}, ['x']),
      rawNode('quote', {}, [rawNode('text', {}, ['Q'])]),
      rawNode('text', {}, ['plain']),
      rawNode('link', { href: 'https://e.com' }, ['L']),
    ]),
  ])
}

// ─── Helper: doc with optional-props OMITTED on every node ────────────
// Maximizes coverage of `?? <default>` fallback branches across every
// renderer's switch arms.
function minimalDoc() {
  return Document({
    children: [
      Page({
        children: [
          Heading({ children: 'No-level heading' }),
          Heading({ level: 2, children: 'Sub' }),
          Heading({ level: 3, children: 'H3' }),
          Heading({ level: 4, children: 'H4' }),
          Heading({ level: 5, children: 'H5' }),
          Heading({ level: 6, children: 'H6' }),
          Text({ children: 'Plain text' }),
          Text({ bold: true, italic: true, underline: true, children: 'Styled' }),
          Text({ strikethrough: true, code: true, children: 'Sty2' }),
          Text({ color: '#f00', children: 'Colored' }),
          Link({ href: 'https://example.com', children: 'Link' }),
          Image({ src: 'https://e.com/i.png' }),
          Image({ src: 'local-path.png', alt: 'Alt' }),
          Image({ src: 'https://e.com/i2.png', caption: 'Cap' }),
          Divider({}),
          Divider({ color: '#abc', thickness: 3 }),
          Spacer({}),
          Spacer({ height: 24 }),
          Button({ href: 'https://e.com', children: 'Btn' }),
          Button({
            background: '#f00',
            color: '#fff',
            href: 'https://e.com',
            children: 'Btn2',
          }),
          Quote({ children: Text({ children: 'Quote text' }) }),
          Quote({ author: 'Author', children: Text({ children: 'Q2' }) }),
          Code({ children: 'console.log(1)' }),
          Code({ language: 'js', children: 'const x = 1\nconst y = 2' }),
          List({
            ordered: false,
            children: [ListItem({ children: 'Item 1' }), ListItem({ children: 'Item 2' })],
          }),
          List({
            ordered: true,
            children: [
              ListItem({ children: 'O1' }),
              ListItem({ children: 'O2' }),
              ListItem({ children: 'O3' }),
            ],
          }),
          Table({
            columns: ['Name', 'Age'],
            rows: [
              ['Alice', 30],
              ['Bob', 25],
            ],
          }),
          Table({
            columns: [{ header: 'X' }, { header: 'Y' }],
            rows: [
              ['a', 'b'],
              ['c', 'd'],
              ['e', 'f'],
            ],
            headerStyle: { background: '#000', color: '#fff' },
            striped: true,
          }),
          Section({
            children: [
              Row({
                children: [
                  Column({ children: Text({ children: 'Col1' }) }),
                  Column({ children: Text({ children: 'Col2' }) }),
                ],
              }),
            ],
          }),
          PageBreak({}),
        ],
      }),
    ],
  })
}

// ─── Bulk: render minimalDoc + bareDoc to every text/binary format ────
describe('bulk renderer sweep', () => {
  const formats = [
    'html',
    'text',
    'md',
    'csv',
    'svg',
    'email',
    'slack',
    'discord',
    'teams',
    'telegram',
    'whatsapp',
    'notion',
    'confluence',
    'google-chat',
    'pptx',
    'xlsx',
  ] as const

  for (const fmt of formats) {
    it(`${fmt} renders minimalDoc without throwing`, async () => {
      const doc = minimalDoc()
      const out = await render(doc, fmt as Parameters<typeof render>[1])
      expect(typeof out === 'string' || out instanceof Uint8Array).toBe(true)
    })
  }

  // bareDoc drops primitive-constructor defaults (`level: 1` etc.) and
  // exercises every renderer's `?? <default>` fallback right-side.
  for (const fmt of formats) {
    it(`${fmt} renders bare nodes (defaults-fallback branch)`, async () => {
      const doc = bareDoc()
      const out = await render(doc, fmt as Parameters<typeof render>[1])
      expect(typeof out === 'string' || out instanceof Uint8Array).toBe(true)
    })
  }
})

// ─── builder.ts chart() / flow() — width/height/caption combos ────────
describe('builder.ts — chart/flow optional props', () => {
  const fakeChart = { getDataURL: () => 'data:image/png;base64,xxx' }
  const fakeFlow = { toSVG: () => '<svg/>' }
  const noOpInst = {}

  it('chart with no opts (all 3 ?? fallbacks)', () => {
    const doc = createDocument()
    doc.chart(fakeChart)
    expect(doc.build()).toBeTruthy()
  })

  it('chart with width only', () => {
    const doc = createDocument()
    doc.chart(fakeChart, { width: 200 })
    expect(doc.build()).toBeTruthy()
  })

  it('chart with height only', () => {
    const doc = createDocument()
    doc.chart(fakeChart, { height: 100 })
    expect(doc.build()).toBeTruthy()
  })

  it('chart with caption only', () => {
    const doc = createDocument()
    doc.chart(fakeChart, { caption: 'Cap' })
    expect(doc.build()).toBeTruthy()
  })

  it('chart with all opts', () => {
    const doc = createDocument()
    doc.chart(fakeChart, { width: 200, height: 100, caption: 'Cap' })
    expect(doc.build()).toBeTruthy()
  })

  it('chart with no getDataURL (fallback Text)', () => {
    const doc = createDocument()
    doc.chart(noOpInst)
    expect(doc.build()).toBeTruthy()
  })

  it('flow with no opts', () => {
    const doc = createDocument()
    doc.flow(fakeFlow)
    expect(doc.build()).toBeTruthy()
  })

  it('flow with width+height', () => {
    const doc = createDocument()
    doc.flow(fakeFlow, { width: 200, height: 100 })
    expect(doc.build()).toBeTruthy()
  })

  it('flow with caption only', () => {
    const doc = createDocument()
    doc.flow(fakeFlow, { caption: 'Cap' })
    expect(doc.build()).toBeTruthy()
  })

  it('flow with no toSVG (fallback Text)', () => {
    const doc = createDocument()
    doc.flow(noOpInst)
    expect(doc.build()).toBeTruthy()
  })
})

// ─── download.ts — error paths ─────────────────────────────────────────
describe('download.ts — error paths', () => {
  it('throws on filename ending with dot (no extension)', async () => {
    const { download } = await import('../download')
    const doc = Document({ children: [] })
    await expect(download(doc, 'report.')).rejects.toThrow(/Filename must have an extension/)
  })

  it('throws on unknown extension', async () => {
    const { download } = await import('../download')
    const doc = Document({ children: [] })
    await expect(download(doc, 'report.xyz')).rejects.toThrow(/Unknown file extension/)
  })
})

// ─── nodes.ts — normalizeChildren edges via primitive constructors ────
describe('nodes.ts — normalizeChildren edges via primitives', () => {
  it('Text with null/false/undefined children → empty', () => {
    expect(Text({ children: null as unknown as string }).children).toEqual([])
    expect(Text({ children: false as unknown as string }).children).toEqual([])
    expect(Text({ children: undefined as unknown as string }).children).toEqual([])
  })

  it('Text with number → stringified', () => {
    expect(Text({ children: 42 as unknown as string }).children).toEqual(['42'])
  })

  it('Text with boolean true → fallback String() arm', () => {
    expect(Text({ children: true as unknown as string }).children).toEqual(['true'])
  })

  it('Text with plain object → throws', () => {
    expect(() => Text({ children: { foo: 'bar' } as unknown as string })).toThrow(/plain objects/)
  })

  it('getTextContent flattens nested DocNode children (cond-expr FALSE arm)', () => {
    const nested = Heading({ level: 1, children: 'Hello world' })
    const text = getTextContent([nested])
    expect(text).toBe('Hello world')
  })
})

// ─── sanitize.ts — all branch paths ────────────────────────────────────
describe('sanitize.ts', () => {
  it('hex colors are kept', () => {
    expect(sanitizeColor('#abc')).toBe('#abc')
    expect(sanitizeColor('#abcdef')).toBe('#abcdef')
  })

  it('named colors are kept', () => {
    expect(sanitizeColor('red')).toBe('red')
  })

  it('rgb/rgba colors are kept', () => {
    expect(sanitizeColor('rgb(1,2,3)')).toBe('rgb(1,2,3)')
    expect(sanitizeColor('rgba(1, 2, 3, 0.5)')).toBe('rgba(1, 2, 3, 0.5)')
  })

  it('hsl colors are kept', () => {
    expect(sanitizeColor('hsl(100, 50%, 50%)')).toBe('hsl(100, 50%, 50%)')
  })

  it('keyword colors (transparent/inherit/etc) are kept', () => {
    expect(sanitizeColor('transparent')).toBe('transparent')
    expect(sanitizeColor('inherit')).toBe('inherit')
  })

  it('garbage is stripped', () => {
    expect(sanitizeColor('url(javascript:alert(1))')).toBe('')
    expect(sanitizeColor('')).toBe('')
  })

  it('sanitizeImageSrc strips javascript URIs', () => {
    expect(sanitizeImageSrc('javascript:alert(1)')).toBe('')
  })

  it('sanitizeImageSrc keeps data: and http: URIs', () => {
    expect(sanitizeImageSrc('https://e.com/i.png')).toBe('https://e.com/i.png')
    expect(sanitizeImageSrc('data:image/png;base64,xxx')).toContain('data:image/png')
  })
})
