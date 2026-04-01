import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  _resetRenderers,
  createDocument,
  Document,
  Heading,
  isDocNode,
  Page,
  registerRenderer,
  render,
  Table,
  Text,
  unregisterRenderer,
} from '../index'
import {
  sanitizeColor,
  sanitizeCss,
  sanitizeHref,
  sanitizeImageSrc,
  sanitizeStyle,
  sanitizeXmlColor,
} from '../sanitize'
import { download } from '../download'

afterEach(() => {
  _resetRenderers()
})

// ─── Sanitize utilities ────────────────────────────────────────────────────

describe('sanitizeCss', () => {
  it('returns empty string for null/undefined', () => {
    expect(sanitizeCss(undefined)).toBe('')
    expect(sanitizeCss(undefined as any)).toBe('')
  })

  it('strips dangerous characters', () => {
    expect(sanitizeCss('color; background{}')).toBe('color background')
    // Strips quotes, parens, and url() prefix
    const urlResult = sanitizeCss("url('bad')")
    expect(urlResult).not.toContain('url(')
    // expression() is stripped
    const exprResult = sanitizeCss('expression(alert())')
    expect(exprResult).not.toContain('expression(')
    // javascript: is stripped
    const jsResult = sanitizeCss('javascript:void(0)')
    expect(jsResult).not.toContain('javascript:')
  })

  it('allows safe CSS values', () => {
    expect(sanitizeCss('red')).toBe('red')
    expect(sanitizeCss('12px')).toBe('12px')
    expect(sanitizeCss('#fff')).toBe('#fff')
  })
})

describe('sanitizeColor', () => {
  it('returns empty string for null/undefined', () => {
    expect(sanitizeColor(undefined)).toBe('')
  })

  it('allows hex colors', () => {
    expect(sanitizeColor('#fff')).toBe('#fff')
    expect(sanitizeColor('#ff0000')).toBe('#ff0000')
    expect(sanitizeColor('#ff000080')).toBe('#ff000080')
  })

  it('allows named colors', () => {
    expect(sanitizeColor('red')).toBe('red')
    expect(sanitizeColor('blue')).toBe('blue')
  })

  it('allows rgb/rgba/hsl/hsla', () => {
    expect(sanitizeColor('rgb(255, 0, 0)')).toBe('rgb(255, 0, 0)')
    expect(sanitizeColor('rgba(255, 0, 0, 0.5)')).toBe('rgba(255, 0, 0, 0.5)')
    expect(sanitizeColor('hsl(0, 100%, 50%)')).toBe('hsl(0, 100%, 50%)')
    expect(sanitizeColor('hsla(0, 100%, 50%, 0.5)')).toBe('hsla(0, 100%, 50%, 0.5)')
  })

  it('allows special keywords', () => {
    expect(sanitizeColor('transparent')).toBe('transparent')
    expect(sanitizeColor('inherit')).toBe('inherit')
    expect(sanitizeColor('currentColor')).toBe('currentColor')
    expect(sanitizeColor('initial')).toBe('initial')
    expect(sanitizeColor('unset')).toBe('unset')
  })

  it('rejects invalid values', () => {
    expect(sanitizeColor('javascript:alert(1)')).toBe('')
    expect(sanitizeColor('expression(something)')).toBe('')
    expect(sanitizeColor('#xyz')).toBe('')
  })
})

describe('sanitizeXmlColor', () => {
  it('returns fallback for null/undefined', () => {
    expect(sanitizeXmlColor(undefined)).toBe('000000')
    expect(sanitizeXmlColor(undefined, 'ffffff')).toBe('ffffff')
  })

  it('strips # from hex', () => {
    expect(sanitizeXmlColor('#ff0000')).toBe('ff0000')
  })

  it('passes through valid hex', () => {
    expect(sanitizeXmlColor('4f46e5')).toBe('4f46e5')
  })

  it('returns fallback for invalid hex', () => {
    expect(sanitizeXmlColor('not-hex')).toBe('000000')
  })
})

describe('sanitizeHref', () => {
  it('returns empty string for null/undefined', () => {
    expect(sanitizeHref(undefined)).toBe('')
  })

  it('allows http/https URLs', () => {
    expect(sanitizeHref('https://example.com')).toBe('https://example.com')
    expect(sanitizeHref('http://example.com')).toBe('http://example.com')
  })

  it('blocks javascript: protocol', () => {
    expect(sanitizeHref('javascript:alert(1)')).toBe('')
    expect(sanitizeHref('  javascript:void(0)')).toBe('')
  })

  it('blocks vbscript: protocol', () => {
    expect(sanitizeHref('vbscript:run')).toBe('')
  })

  it('blocks non-image data: URIs', () => {
    expect(sanitizeHref('data:text/html,<script>alert(1)</script>')).toBe('')
  })

  it('allows data:image URIs', () => {
    expect(sanitizeHref('data:image/png;base64,abc')).toBe('data:image/png;base64,abc')
  })
})

describe('sanitizeImageSrc', () => {
  it('returns empty string for null/undefined', () => {
    expect(sanitizeImageSrc(undefined)).toBe('')
  })

  it('allows http URLs', () => {
    expect(sanitizeImageSrc('https://example.com/img.png')).toBe('https://example.com/img.png')
  })

  it('blocks javascript: protocol', () => {
    expect(sanitizeImageSrc('javascript:alert(1)')).toBe('')
  })

  it('blocks vbscript: protocol', () => {
    expect(sanitizeImageSrc('vbscript:run')).toBe('')
  })

  it('blocks non-image data: URIs', () => {
    expect(sanitizeImageSrc('data:text/html,bad')).toBe('')
  })

  it('allows data:image URIs', () => {
    expect(sanitizeImageSrc('data:image/png;base64,abc')).toBe('data:image/png;base64,abc')
  })
})

describe('sanitizeStyle', () => {
  it('returns empty string for null/undefined', () => {
    expect(sanitizeStyle(undefined)).toBe('')
  })

  it('sanitizes CSS in style attribute', () => {
    expect(sanitizeStyle('color: red')).toBe('color: red')
    expect(sanitizeStyle('expression(alert())')).not.toContain('expression(')
  })
})

// ─── Node construction edge cases ──────────────────────────────────────────

describe('isDocNode', () => {
  it('returns false for null', () => {
    expect(isDocNode(null)).toBe(false)
  })

  it('returns false for string', () => {
    expect(isDocNode('hello')).toBe(false)
  })

  it('returns false for number', () => {
    expect(isDocNode(42)).toBe(false)
  })

  it('returns false for plain object without required keys', () => {
    expect(isDocNode({ type: 'foo' })).toBe(false)
    expect(isDocNode({ type: 'foo', props: {} })).toBe(false)
  })

  it('returns true for valid DocNode', () => {
    expect(isDocNode({ type: 'text', props: {}, children: [] })).toBe(true)
  })
})

describe('normalizeChildren edge cases', () => {
  it('handles number children', () => {
    const node = Text({ children: 42 as any })
    expect(node.children).toEqual(['42'])
  })

  it('handles false/null children', () => {
    const node = Text({ children: false as any })
    expect(node.children).toEqual([])

    const node2 = Text({ children: null as any })
    expect(node2.children).toEqual([])
  })

  it('handles nested array children', () => {
    const node = Page({ children: [['a', 'b'], 'c'] as any })
    expect(node.children).toEqual(['a', 'b', 'c'])
  })

  it('throws on plain object children', () => {
    expect(() => {
      Text({ children: { invalid: true } as any })
    }).toThrow('Invalid child')
  })
})

// ─── Download function ─────────────────────────────────────────────────────

describe('download', () => {
  it('throws for filename with unknown extension', async () => {
    const doc = Document({ children: Text({ children: 'hello' }) })
    // "noext" becomes ".noext" as extension which is unknown
    await expect(download(doc, 'file.noext')).rejects.toThrow('Unknown file extension')
  })

  it('throws for unknown extension', async () => {
    const doc = Document({ children: Text({ children: 'hello' }) })
    await expect(download(doc, 'file.zzz')).rejects.toThrow("Unknown file extension '.zzz'")
  })

  it('downloads html file', async () => {
    const doc = Document({ children: Text({ children: 'hello' }) })
    // Mock URL.createObjectURL and element click
    const urlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const clickSpy = vi.fn()
    vi.spyOn(document, 'createElement').mockReturnValue({
      set href(_: string) {},
      set download(_: string) {},
      click: clickSpy,
    } as any)

    await download(doc, 'file.html')

    expect(clickSpy).toHaveBeenCalled()
    expect(revokeSpy).toHaveBeenCalled()

    urlSpy.mockRestore()
    revokeSpy.mockRestore()
    vi.restoreAllMocks()
  })
})

// ─── Render function edge cases ────────────────────────────────────────────

describe('render — edge cases', () => {
  it('throws for unregistered format', async () => {
    const doc = Document({ children: Text({ children: 'hello' }) })
    unregisterRenderer('nonexistent') // just to exercise the path
    await expect(render(doc, 'nonexistent')).rejects.toThrow("No renderer registered")
  })

  it('registerRenderer with direct renderer (not lazy loader)', async () => {
    registerRenderer('test-format', {
      async render(_node, _options) {
        return 'test-output'
      },
    })
    const doc = Document({ children: Text({ children: 'hello' }) })
    const result = await render(doc, 'test-format')
    expect(result).toBe('test-output')
  })

  it('lazy renderer is cached after first use', async () => {
    let loadCount = 0
    registerRenderer('counted', () => {
      loadCount++
      return Promise.resolve({
        async render() {
          return 'ok'
        },
      })
    })
    const doc = Document({ children: Text({ children: 'hello' }) })
    await render(doc, 'counted')
    await render(doc, 'counted')
    expect(loadCount).toBe(1) // Only loaded once
  })
})

// ─── createDocument builder ────────────────────────────────────────────────

describe('createDocument builder', () => {
  it('builds and renders to html', async () => {
    const result = await createDocument({ title: 'Test' })
      .heading('Title')
      .text('paragraph')
      .toHtml()

    expect(result).toContain('Title')
    expect(result).toContain('paragraph')
  })

  it('builds with table', async () => {
    const result = await createDocument()
      .table({ columns: ['A', 'B'], rows: [['x', 'y']] })
      .toMarkdown()

    expect(result).toContain('A')
    expect(result).toContain('x')
  })

  it('builds with all methods', async () => {
    const builder = createDocument({ title: 'Full' })
      .heading('H1')
      .text('para', { bold: true })
      .link('link', { href: 'https://example.com' })
      .image('https://example.com/img.png', { width: 100 })
      .table({ columns: ['Col'], rows: [['val']] })
      .code('x = 1', { language: 'js' })
      .divider()
      .spacer(20)
      .list(['a', 'b'])
      .quote('quoted')
      .button('Go', { href: 'https://example.com' })
      .pageBreak()

    const text = await builder.toText()
    expect(text).toContain('H1')
    expect(text).toContain('para')
  })

  it('toMarkdown works', async () => {
    const result = await createDocument().heading('Title').toMarkdown()
    expect(result).toContain('Title')
  })

  it('toCsv works with table', async () => {
    // CSV requires a table in the document
    const doc = Document({
      children: Table({ columns: ['A', 'B'], rows: [['1', '2']] }),
    })
    const result = (await render(doc, 'csv')) as string
    expect(result).toContain('A')
    expect(result).toContain('1')
  })

  it('toSlack works', async () => {
    const result = await createDocument().heading('Title').toSlack()
    const parsed = JSON.parse(result)
    expect(parsed.blocks).toBeDefined()
  })

  it('toSvg works', async () => {
    const result = await createDocument().heading('Title').toSvg()
    expect(result).toContain('<svg')
  })

  it('toTeams works', async () => {
    const result = await createDocument().heading('Title').toTeams()
    expect(result).toContain('AdaptiveCard')
  })

  it('toDiscord works', async () => {
    const result = await createDocument().heading('Title').toDiscord()
    expect(result).toContain('embeds')
  })

  it('toTelegram works', async () => {
    const result = await createDocument().heading('Title').toTelegram()
    expect(result).toContain('Title')
  })

  it('toNotion works', async () => {
    const result = await createDocument().heading('Title').toNotion()
    const parsed = JSON.parse(result)
    expect(parsed.children).toBeDefined()
    expect(parsed.children.length).toBeGreaterThan(0)
  })

  it('toConfluence works', async () => {
    const result = await createDocument().heading('Title').toConfluence()
    expect(result).toContain('"doc"')
  })

  it('toWhatsApp works', async () => {
    const result = await createDocument().heading('Title').toWhatsApp()
    expect(result).toContain('*Title*')
  })

  it('toGoogleChat works', async () => {
    const result = await createDocument().heading('Title').toGoogleChat()
    expect(result).toContain('cardsV2')
  })

  it('toEmail works', async () => {
    const result = await createDocument().heading('Title').toEmail()
    expect(result).toContain('Title')
  })
})
