/**
 * Coverage-gap tests — drives the specific renderer / builder / download
 * branches the existing suites miss. Each test is built to take ONE
 * previously-untaken arm: an unknown node type hitting a `default:`
 * switch case, a section with a string child hitting the `if (typeof
 * child !== 'string')` false side, a heading at an out-of-range level
 * hitting the `?? fallback` right side, a binary result reaching the
 * Uint8Array download blob path, etc.
 *
 * Raw-node construction (bypassing the primitive constructors) is used
 * where the constructor would normalize away the shape we want to test
 * (e.g. a standalone `list-item`, an unknown node type, or a string
 * child placed directly under a section).
 */
import { describe, expect, it, vi } from 'vitest'
import { createDocument, render } from '../index'
import { download } from '../download'
import type { DocNode } from '../types'

// Raw DocNode constructor — bypasses the primitive helpers so we can
// place arbitrary node types / children combinations the public
// constructors would otherwise normalize.
function raw(
  type: string,
  props: Record<string, unknown> = {},
  children: (string | DocNode)[] = [],
): DocNode {
  return { type, props, children } as DocNode
}

// Wrap one or more nodes in a minimal document → page so renderers
// that only dispatch from the document root see them.
function doc(...nodes: (string | DocNode)[]): DocNode {
  return raw('document', {}, [raw('page', {}, nodes)])
}

// ─── Unknown node type → every renderer's `default:` switch arm ──────────────

describe('default switch arm — unknown node type', () => {
  // An unknown node type that still carries children, so the default
  // arm's `renderChildren(...)` (where present) is exercised too.
  const unknownDoc = doc(raw('mystery-widget', {}, ['fallback content']))

  it('text renderer falls through to default', async () => {
    const out = await render(unknownDoc, 'text')
    expect(out).toContain('fallback content')
  })

  it('markdown renderer falls through to default', async () => {
    const out = await render(unknownDoc, 'md')
    expect(out).toContain('fallback content')
  })

  it('html renderer falls through to default', async () => {
    const out = await render(unknownDoc, 'html')
    expect(out).toContain('fallback content')
  })

  it('email renderer falls through to default', async () => {
    const out = await render(unknownDoc, 'email')
    expect(out).toContain('fallback content')
  })

  it('telegram renderer falls through to default (empty)', async () => {
    const out = await render(unknownDoc, 'telegram')
    expect(typeof out).toBe('string')
  })

  it('whatsapp renderer falls through to default (empty)', async () => {
    const out = await render(unknownDoc, 'whatsapp')
    expect(typeof out).toBe('string')
  })
})

// ─── Standalone list-item → `case 'list-item'` switch arm ────────────────────

describe('standalone list-item switch arm', () => {
  // The `list` case maps its children inline, so a `list-item` only
  // reaches renderNode when it appears OUTSIDE a list.
  const liDoc = doc(raw('list-item', {}, ['orphan item']))

  it('text renderer handles a standalone list-item', async () => {
    const out = await render(liDoc, 'text')
    expect(out).toContain('orphan item')
  })

  it('markdown renderer handles a standalone list-item', async () => {
    const out = await render(liDoc, 'md')
    expect(out).toContain('orphan item')
  })
})

// ─── String children under section/row/column → `if (typeof child !== 'string')` false ─

describe('string child under section/row/column', () => {
  // A raw string placed directly inside a section (the constructors
  // would keep it, but the existing fixtures only put DocNodes there).
  function sectionWithStringChild(): DocNode {
    return raw('document', {}, [
      raw('page', {}, [raw('section', {}, ['bare string in section', raw('text', {}, ['real node'])])]),
    ])
  }

  it.each([
    ['svg'],
    ['slack'],
    ['notion'],
    ['confluence'],
    ['teams'],
    ['discord'],
    ['google-chat'],
  ])('%s renderer skips a string child of a section', async (format) => {
    const out = await render(sectionWithStringChild(), format)
    // Renderer must not throw; the DocNode sibling is still processed.
    expect(out).toBeTruthy()
  })
})

// ─── Heading at an out-of-range level → `sizes[level] ?? fallback` right side ─

describe('out-of-range heading level', () => {
  // level 7 isn't in any renderer's size map → exercises the `?? <default>`
  // right side. Built raw because the Heading constructor doesn't clamp.
  const bigHeadingDoc = doc(raw('heading', { level: 7 }, ['Deep heading']))

  it.each([['email'], ['html'], ['svg'], ['teams']])(
    '%s renderer uses the fallback size for level 7',
    async (format) => {
      const out = await render(bigHeadingDoc, format)
      expect(out).toBeTruthy()
    },
  )
})

// ─── Markdown frontmatter — author/subject WITHOUT title ─────────────────────

describe('markdown frontmatter without title', () => {
  it('emits author + description but no title line', async () => {
    const d = raw('document', { author: 'Ada', subject: 'Notes' }, [raw('text', {}, ['Body'])])
    const out = await render(d, 'md')
    expect(out).toContain('author: "Ada"')
    expect(out).toContain('description: "Notes"')
    expect(out).not.toContain('title:')
  })
})

// ─── Email — optional-prop true sides + nested padding shapes ────────────────

describe('email renderer optional props', () => {
  it('emits the hidden preview block when subject is set', async () => {
    const d = raw('document', { subject: 'Preview text' }, [raw('text', {}, ['Hi'])])
    const out = await render(d, 'email')
    expect(out).toContain('Preview text')
  })

  it('section with numeric padding', async () => {
    const d = doc(raw('section', { padding: 16 }, [raw('text', {}, ['x'])]))
    const out = await render(d, 'email')
    expect(out).toContain('padding:16px')
  })

  it('section with array padding', async () => {
    const d = doc(raw('section', { padding: [4, 8] }, [raw('text', {}, ['x'])]))
    const out = await render(d, 'email')
    expect(out).toContain('padding:4px 8px')
  })

  it('section with non-number non-array padding falls back to "0"', async () => {
    // A truthy padding that is neither a number nor an array hits the
    // innermost ternary `: '0'` fallback. Raw-built because the public
    // SectionProps types padding as number | tuple.
    const d = doc(raw('section', { padding: 'weird' }, [raw('text', {}, ['x'])]))
    const out = await render(d, 'email')
    expect(out).toContain('padding:0')
  })

  it('image with width + height + caption', async () => {
    const d = doc(
      raw('image', { src: 'https://e.com/i.png', width: 320, height: 200, caption: 'Cap', align: 'center' }, []),
    )
    const out = await render(d, 'email')
    expect(out).toContain('width="320"')
    expect(out).toContain('height="200"')
    expect(out).toContain('Cap')
  })

  it('table column with explicit numeric width', async () => {
    const d = doc(
      raw(
        'table',
        {
          columns: [{ header: 'Wide', width: 200 }, { header: 'Str', width: '50%' }],
          rows: [['a', 'b']],
        },
        [],
      ),
    )
    const out = await render(d, 'email')
    expect(out).toContain('width:200px')
    expect(out).toContain('width:50%')
  })
})

// ─── HTML — style sanitize-to-empty, lang fallback, image/table optional props ─

describe('html renderer optional props', () => {
  it('drops a style value that sanitizes to empty', async () => {
    // align value made entirely of stripped chars → sanitizeStyle === ''
    // → the `if (safeV !== '')` false arm.
    const d = doc(raw('heading', { level: 2, align: '()<>' }, ['Title']))
    const out = await render(d, 'html')
    expect(out).toContain('<h2')
    // text-align must NOT appear — the value was stripped to empty.
    expect(out).not.toContain('text-align')
  })

  it('falls back to lang="en" when the document language is all-invalid chars', async () => {
    // `lang` is read from the DOCUMENT props (the <html lang> attribute).
    // A value of only invalid BCP-47 chars strips to '' → `'' || 'en'`.
    const d = raw('document', { language: '!!!@@@' }, [raw('text', {}, ['x = 1'])])
    const out = await render(d, 'html')
    expect(out).toContain('lang="en"')
  })

  it('image with width + height + caption + center align', async () => {
    const d = doc(
      raw('image', { src: 'https://e.com/i.png', width: 100, height: 50, caption: 'Fig', align: 'center' }, []),
    )
    const out = await render(d, 'html')
    expect(out).toContain('width="100"')
    expect(out).toContain('height="50"')
    expect(out).toContain('text-align:center')
    expect(out).toContain('Fig')
  })

  it('table header style bold:false + column width', async () => {
    const d = doc(
      raw(
        'table',
        {
          columns: [{ header: 'A', width: 120 }, { header: 'B', align: 'right' }],
          rows: [['1', '2']],
          headerStyle: { bold: false },
        },
        [],
      ),
    )
    const out = await render(d, 'html')
    // bold:false → font-weight:bold must NOT be present in the th style
    expect(out).not.toContain('font-weight:bold')
    expect(out).toContain('width:120px')
  })
})

// ─── Teams — color / size adaptive-card properties ───────────────────────────

describe('teams renderer text properties', () => {
  it('text with color, large size, and small size', async () => {
    const d = doc(
      raw('text', { color: '#ff0000' }, ['Colored']),
      raw('text', { size: 20 }, ['Large']),
      raw('text', { size: 10 }, ['Small']),
    )
    const out = await render(d, 'teams')
    expect(out).toContain('Colored')
    expect(out).toContain('Large')
    expect(out).toContain('Small')
  })
})

// ─── Discord — non-h1 heading, non-http image, large-table null cell ─────────

describe('discord renderer meta + table edges', () => {
  it('extractMeta skips a level-2 heading and a non-http image', async () => {
    const d = doc(
      raw('heading', { level: 2 }, ['Subhead first']),
      raw('image', { src: 'local/relative.png' }, []),
      raw('text', {}, ['body']),
    )
    const out = await render(d, 'discord')
    expect(out).toBeTruthy()
  })

  it('large table (>3 cols) with null cells uses the code-block fallback', async () => {
    const d = doc(
      raw(
        'table',
        {
          columns: ['A', 'B', 'C', 'D'],
          rows: [['1', null, undefined, '4']],
        },
        [],
      ),
    )
    const out = await render(d, 'discord')
    expect(typeof out).toBe('string')
    const parsed = JSON.parse(out as string)
    const text = JSON.stringify(parsed)
    expect(text).toContain('```')
  })
})

// ─── Telegram / WhatsApp — string child directly under a container ───────────

describe('telegram / whatsapp string container child', () => {
  // typeof c === 'string' ? esc(c) : renderNode(c) — true (string) side.
  function containerWithStringChild(): DocNode {
    return raw('document', {}, ['raw string child', raw('text', {}, ['node child'])])
  }

  it('telegram escapes a string child of the document', async () => {
    const out = await render(containerWithStringChild(), 'telegram')
    expect(out).toContain('raw string child')
  })

  it('whatsapp keeps a string child of the document', async () => {
    const out = await render(containerWithStringChild(), 'whatsapp')
    expect(out).toContain('raw string child')
  })
})

// ─── SVG — string child under a section + level-7 heading ────────────────────

describe('svg renderer edges', () => {
  it('skips a string child of a section and renders a deep heading', async () => {
    const d = raw('document', {}, [
      raw('page', {}, [
        raw('section', {}, ['stray string', raw('text', {}, ['t'])]),
        raw('heading', { level: 7 }, ['Deep']),
      ]),
    ])
    const out = await render(d, 'svg')
    expect(out).toContain('<svg')
    expect(out).toContain('Deep')
  })
})

// ─── XLSX — column with explicit alignment → mapAlignment true arm ────────────

describe('xlsx renderer column alignment', () => {
  it('maps a column align to ExcelJS horizontal alignment', async () => {
    const d = doc(
      raw(
        'table',
        {
          columns: [{ header: 'Left', align: 'left' }, { header: 'Center', align: 'center' }, { header: 'Right', align: 'right' }],
          rows: [['a', 'b', 'c']],
        },
        [],
      ),
    )
    const out = await render(d, 'xlsx')
    expect(out).toBeInstanceOf(Uint8Array)
    expect((out as Uint8Array).length).toBeGreaterThan(0)
  })
})

// ─── PPTX — level-7 heading, string section/page children, subject metadata ──

describe('pptx renderer edges', () => {
  it('handles deep heading, string container children, and subject metadata', async () => {
    const d = raw('document', { subject: 'Deck subject' }, [
      raw('page', {}, [
        'stray string under page',
        raw('section', {}, ['stray string under section', raw('text', {}, ['Body'])]),
        raw('heading', { level: 7 }, ['Deep heading']),
      ]),
    ])
    const out = await render(d, 'pptx')
    expect(out).toBeInstanceOf(Uint8Array)
    expect((out as Uint8Array).length).toBeGreaterThan(1000)
  })
})

// ─── Builder — binary-format delegators (toPdf/toDocx/toPptx/toXlsx) ─────────

describe('builder binary-format methods', () => {
  it('toXlsx produces a Uint8Array', async () => {
    const out = await createDocument().heading('X').table({ columns: ['A'], rows: [['1']] }).toXlsx()
    expect(out).toBeInstanceOf(Uint8Array)
  })

  it('toPptx produces a Uint8Array', async () => {
    const out = await createDocument().heading('X').text('body').toPptx()
    expect(out).toBeInstanceOf(Uint8Array)
  })

  it('toDocx produces a Uint8Array', async () => {
    const out = await createDocument().heading('X').text('body').toDocx()
    expect(out).toBeInstanceOf(Uint8Array)
  })

  it('toPdf produces a Uint8Array', async () => {
    const out = await createDocument().heading('X').text('body').toPdf()
    expect(out).toBeInstanceOf(Uint8Array)
  })

  it('download() delegates to the download helper', async () => {
    const urlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const clickSpy = vi.fn()
    vi.spyOn(document, 'createElement').mockReturnValue({
      set href(_: string) {},
      set download(_: string) {},
      click: clickSpy,
    } as unknown as HTMLElement)

    await createDocument().heading('Report').text('body').download('report.html')

    expect(clickSpy).toHaveBeenCalled()
    urlSpy.mockRestore()
    revokeSpy.mockRestore()
    vi.restoreAllMocks()
  })
})

// ─── download — binary (Uint8Array) blob path + server guard ─────────────────

describe('download — binary result path', () => {
  it('downloads a binary (xlsx) result via the Uint8Array Blob branch', async () => {
    const d = doc(raw('table', { columns: ['A'], rows: [['1']] }, []))
    const urlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const clickSpy = vi.fn()
    vi.spyOn(document, 'createElement').mockReturnValue({
      set href(_: string) {},
      set download(_: string) {},
      click: clickSpy,
    } as unknown as HTMLElement)

    await download(d, 'sheet.xlsx')

    expect(clickSpy).toHaveBeenCalled()
    expect(revokeSpy).toHaveBeenCalled()

    urlSpy.mockRestore()
    revokeSpy.mockRestore()
    vi.restoreAllMocks()
  })
})
