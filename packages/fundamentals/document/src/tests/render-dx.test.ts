/**
 * Bug / DX locks (audit fix): xlsx sheet names, per-format `render()`
 * return types, `download()` blob handling, and inline links in the
 * notion / discord / teams paragraph renderers.
 */
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { download } from '../download'
import { Document, Heading, Link, Page, Table, Text } from '../nodes'
import { render } from '../render'
import type { DocNode, RenderResult } from '../types'

const table = () => Table({ columns: ['a'], rows: [['1']] })

async function sheetNames(node: DocNode): Promise<string[]> {
  const bytes = (await render(node, 'xlsx')) as Uint8Array
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
  return wb.worksheets.map((ws) => ws.name)
}

describe('xlsx sheet names', () => {
  it('a heading with characters Excel forbids does not make render() throw', async () => {
    const node = Document({
      children: [Page({ children: [Heading({ children: ['Q1/Q2: [draft]*?\\'] }), table()] })],
    })
    const names = await sheetNames(node)
    expect(names).toHaveLength(1)
    expect(names[0]).not.toMatch(/[[\]:*?/\\]/)
    expect(names[0]).toContain('Q1')
  })

  it('duplicate headings get unique names (Excel compares case-insensitively)', async () => {
    const node = Document({
      children: [
        Page({ children: [Heading({ children: ['Report'] }), table()] }),
        Page({ children: [Heading({ children: ['report'] }), table()] }),
        Page({ children: [Heading({ children: ['Report'] }), table()] }),
      ],
    })
    const names = await sheetNames(node)
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(3)
  })

  it('names are capped at 31 chars, and an all-forbidden heading falls back to Sheet N', async () => {
    const node = Document({
      children: [
        Page({ children: [Heading({ children: ['x'.repeat(50)] }), table()] }),
        Page({ children: [Heading({ children: ['[]:*?/\\'] }), table()] }),
      ],
    })
    const names = await sheetNames(node)
    expect(names[0]).toHaveLength(31)
    expect(names[1]).toBe('Sheet 2')
  })
})

describe('render() return type follows the format', () => {
  it('binary formats resolve to Uint8Array, text formats to string (types + runtime)', async () => {
    const node = Document({ children: [Page({ children: [table()] })] })
    // Type-level only (never invoked — `render` would reject the custom
    // format at runtime); checked by `tsc` in the package typecheck.
    const _typeChecks = () => {
      expectTypeOf(render(node, 'pdf')).toEqualTypeOf<Promise<Uint8Array>>()
      expectTypeOf(render(node, 'docx')).toEqualTypeOf<Promise<Uint8Array>>()
      expectTypeOf(render(node, 'xlsx')).toEqualTypeOf<Promise<Uint8Array>>()
      expectTypeOf(render(node, 'pptx')).toEqualTypeOf<Promise<Uint8Array>>()
      expectTypeOf(render(node, 'html')).toEqualTypeOf<Promise<string>>()
      expectTypeOf(render(node, 'md')).toEqualTypeOf<Promise<string>>()
      expectTypeOf(render(node, 'slack')).toEqualTypeOf<Promise<string>>()
      // a custom registered format is still the union
      expectTypeOf(render(node, 'my-format' as string)).toEqualTypeOf<Promise<RenderResult>>()
    }
    void _typeChecks

    const xlsx: Uint8Array = await render(node, 'xlsx')
    const md: string = await render(node, 'md')
    expect(xlsx).toBeInstanceOf(Uint8Array)
    expect(typeof md).toBe('string')
  })
})

describe('download()', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function stubAnchor() {
    const clickSpy = vi.fn()
    vi.spyOn(document, 'createElement').mockReturnValue({
      set href(_: string) {},
      set download(_: string) {},
      click: clickSpy,
    } as unknown as HTMLElement)
    return clickSpy
  }

  it('binary Blobs carry the format MIME type', async () => {
    let blob: Blob | undefined
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      blob = b as Blob
      return 'blob:mock'
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    stubAnchor()
    await download(Document({ children: [Page({ children: [table()] })] }), 'sheet.xlsx')
    expect(blob?.type).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
  })

  it('the object URL is revoked AFTER the click has been dispatched, not synchronously', async () => {
    vi.useFakeTimers()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const click = stubAnchor()
    await download(Document({ children: [Text({ children: ['hi'] })] }), 'a.html')
    expect(click).toHaveBeenCalledOnce()
    expect(revoke).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(revoke).toHaveBeenCalledWith('blob:mock')
  })
})

describe('inline links inside paragraphs keep their href', () => {
  const URL_ = 'https://inline.example/p'
  const node = () =>
    Document({
      children: [
        Page({
          children: [
            Text({ children: ['Read ', Link({ href: URL_, children: ['this'] }), ' now'] }),
          ],
        }),
      ],
    })

  it('notion: a rich_text run with a link', async () => {
    const out = (JSON.parse((await render(node(), 'notion')) as string) as { children: unknown }).children as {
      paragraph?: { rich_text: { text: { content: string; link?: { url: string } } }[] }
    }[]
    const rich = out.find((b) => b.paragraph)?.paragraph?.rich_text ?? []
    expect(rich.map((r) => r.text.content).join('')).toBe('Read this now')
    expect(rich.find((r) => r.text.content === 'this')?.text.link?.url).toBe(URL_)
  })

  it('discord: masked link in the description', async () => {
    const out = (await render(node(), 'discord')) as string
    expect(out).toContain(`[this](${URL_})`)
  })

  it('teams: markdown link in the TextBlock', async () => {
    const out = (await render(node(), 'teams')) as string
    expect(out).toContain(`[this](${URL_})`)
  })
})
