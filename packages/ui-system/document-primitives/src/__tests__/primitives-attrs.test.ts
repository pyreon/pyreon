import { initTestConfig, renderProps } from '@pyreon/test-utils'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let cleanup: () => void
beforeAll(() => {
  cleanup = initTestConfig()
})
afterAll(() => cleanup())

// --------------------------------------------------------
// DocDocument (Element-based)
// --------------------------------------------------------
describe('DocDocument attrs', () => {
  it('sets tag to div', async () => {
    const DocDocument = (await import('../primitives/DocDocument')).default
    const result = renderProps(DocDocument, { children: 'test' })
    expect(result.tag).toBe('div')
  })

  it('passes title to _documentProps', async () => {
    const DocDocument = (await import('../primitives/DocDocument')).default
    const result = renderProps(DocDocument, { title: 'My Doc', children: 'test' })
    expect(result._documentProps.title).toBe('My Doc')
  })

  it('passes author to _documentProps', async () => {
    const DocDocument = (await import('../primitives/DocDocument')).default
    const result = renderProps(DocDocument, { author: 'Jane', children: 'test' })
    expect(result._documentProps.author).toBe('Jane')
  })

  it('passes subject to _documentProps', async () => {
    const DocDocument = (await import('../primitives/DocDocument')).default
    const result = renderProps(DocDocument, { subject: 'Report', children: 'test' })
    expect(result._documentProps.subject).toBe('Report')
  })

  it('omits missing optional fields from _documentProps', async () => {
    const DocDocument = (await import('../primitives/DocDocument')).default
    const result = renderProps(DocDocument, { children: 'test' })
    expect(result._documentProps).toEqual({})
  })
})

// --------------------------------------------------------
// DocHeading (Text-based: tag -> as)
// --------------------------------------------------------
describe('DocHeading attrs', () => {
  it('defaults to h1', async () => {
    const DocHeading = (await import('../primitives/DocHeading')).default
    const result = renderProps(DocHeading, { children: 'Hello' })
    expect(result.as).toBe('h1')
    expect(result._documentProps.level).toBe(1)
  })

  it('sets tag to h2 when level is h2', async () => {
    const DocHeading = (await import('../primitives/DocHeading')).default
    const result = renderProps(DocHeading, { level: 'h2', children: 'Hello' })
    expect(result.as).toBe('h2')
    expect(result._documentProps.level).toBe(2)
  })

  it('parses level h6', async () => {
    const DocHeading = (await import('../primitives/DocHeading')).default
    const result = renderProps(DocHeading, { level: 'h6', children: 'Hello' })
    expect(result.as).toBe('h6')
    expect(result._documentProps.level).toBe(6)
  })
})

// --------------------------------------------------------
// DocText (Text-based: tag -> as)
// --------------------------------------------------------
describe('DocText attrs', () => {
  it('sets tag to p', async () => {
    const DocText = (await import('../primitives/DocText')).default
    const result = renderProps(DocText, { children: 'Hello' })
    expect(result.as).toBe('p')
    expect(result._documentProps).toEqual({})
  })
})

// --------------------------------------------------------
// DocLink (Text-based: tag -> as)
// --------------------------------------------------------
describe('DocLink attrs', () => {
  it('sets tag to a', async () => {
    const DocLink = (await import('../primitives/DocLink')).default
    const result = renderProps(DocLink, { children: 'Click' })
    expect(result.as).toBe('a')
  })

  it('passes href to _documentProps', async () => {
    const DocLink = (await import('../primitives/DocLink')).default
    const result = renderProps(DocLink, { href: 'https://example.com', children: 'Click' })
    expect(result._documentProps.href).toBe('https://example.com')
  })

  it('defaults href to # when not provided', async () => {
    const DocLink = (await import('../primitives/DocLink')).default
    const result = renderProps(DocLink, { children: 'Click' })
    expect(result._documentProps.href).toBe('#')
  })
})

// --------------------------------------------------------
// DocImage (Element-based)
// --------------------------------------------------------
describe('DocImage attrs', () => {
  it('sets tag to img', async () => {
    const DocImage = (await import('../primitives/DocImage')).default
    const result = renderProps(DocImage, { children: null })
    expect(result.tag).toBe('img')
  })

  it('passes src to _documentProps', async () => {
    const DocImage = (await import('../primitives/DocImage')).default
    const result = renderProps(DocImage, { src: 'photo.png', children: null })
    expect(result._documentProps.src).toBe('photo.png')
  })

  it('defaults src to empty string', async () => {
    const DocImage = (await import('../primitives/DocImage')).default
    const result = renderProps(DocImage, { children: null })
    expect(result._documentProps.src).toBe('')
  })

  it('passes alt, width, height, caption when provided', async () => {
    const DocImage = (await import('../primitives/DocImage')).default
    const result = renderProps(DocImage, {
      src: 'photo.png',
      alt: 'A photo',
      width: 200,
      height: 100,
      caption: 'My photo',
      children: null,
    })
    expect(result._documentProps.alt).toBe('A photo')
    expect(result._documentProps.width).toBe(200)
    expect(result._documentProps.height).toBe(100)
    expect(result._documentProps.caption).toBe('My photo')
  })

  it('omits alt, width, height, caption when not provided', async () => {
    const DocImage = (await import('../primitives/DocImage')).default
    const result = renderProps(DocImage, { children: null })
    expect(result._documentProps.alt).toBeUndefined()
    expect(result._documentProps.width).toBeUndefined()
    expect(result._documentProps.height).toBeUndefined()
    expect(result._documentProps.caption).toBeUndefined()
  })
})

// --------------------------------------------------------
// DocTable (Element-based)
// --------------------------------------------------------
describe('DocTable attrs', () => {
  it('sets tag to table', async () => {
    const DocTable = (await import('../primitives/DocTable')).default
    const result = renderProps(DocTable, { children: null })
    expect(result.tag).toBe('table')
  })

  it('defaults columns and rows to empty arrays', async () => {
    const DocTable = (await import('../primitives/DocTable')).default
    const result = renderProps(DocTable, { children: null })
    expect(result._documentProps.columns).toEqual([])
    expect(result._documentProps.rows).toEqual([])
  })

  it('passes all table options when provided', async () => {
    const DocTable = (await import('../primitives/DocTable')).default
    const result = renderProps(DocTable, {
      columns: [{ header: 'Name' }],
      rows: [['Alice']],
      headerStyle: { fontWeight: 'bold' },
      striped: true,
      bordered: true,
      caption: 'Users',
      children: null,
    })
    expect(result._documentProps.columns).toEqual([{ header: 'Name' }])
    expect(result._documentProps.rows).toEqual([['Alice']])
    expect(result._documentProps.headerStyle).toEqual({ fontWeight: 'bold' })
    expect(result._documentProps.striped).toBe(true)
    expect(result._documentProps.bordered).toBe(true)
    expect(result._documentProps.caption).toBe('Users')
  })
})

// --------------------------------------------------------
// DocList (Element-based)
// --------------------------------------------------------
describe('DocList attrs', () => {
  it('sets tag to ul by default', async () => {
    const DocList = (await import('../primitives/DocList')).default
    const result = renderProps(DocList, { children: null })
    expect(result.tag).toBe('ul')
  })

  it('sets tag to ol when ordered is true', async () => {
    const DocList = (await import('../primitives/DocList')).default
    const result = renderProps(DocList, { ordered: true, children: null })
    expect(result.tag).toBe('ol')
    expect(result._documentProps.ordered).toBe(true)
  })

  it('has empty _documentProps when not ordered', async () => {
    const DocList = (await import('../primitives/DocList')).default
    const result = renderProps(DocList, { children: null })
    expect(result._documentProps).toEqual({})
  })
})

// --------------------------------------------------------
// DocListItem (Text-based: tag -> as)
// --------------------------------------------------------
describe('DocListItem attrs', () => {
  it('sets tag to li', async () => {
    const DocListItem = (await import('../primitives/DocListItem')).default
    const result = renderProps(DocListItem, { children: 'item' })
    expect(result.as).toBe('li')
    expect(result._documentProps).toEqual({})
  })
})

// --------------------------------------------------------
// DocCode (Text-based: tag -> as)
// --------------------------------------------------------
describe('DocCode attrs', () => {
  it('sets tag to pre', async () => {
    const DocCode = (await import('../primitives/DocCode')).default
    const result = renderProps(DocCode, { children: 'code' })
    expect(result.as).toBe('pre')
  })

  it('passes language to _documentProps when provided', async () => {
    const DocCode = (await import('../primitives/DocCode')).default
    const result = renderProps(DocCode, { language: 'typescript', children: 'code' })
    expect(result._documentProps.language).toBe('typescript')
  })

  it('has empty _documentProps when no language', async () => {
    const DocCode = (await import('../primitives/DocCode')).default
    const result = renderProps(DocCode, { children: 'code' })
    expect(result._documentProps).toEqual({})
  })
})

// --------------------------------------------------------
// DocDivider (Element-based)
// --------------------------------------------------------
describe('DocDivider attrs', () => {
  it('sets tag to hr', async () => {
    const DocDivider = (await import('../primitives/DocDivider')).default
    const result = renderProps(DocDivider, { children: null })
    expect(result.tag).toBe('hr')
  })

  it('passes color and thickness when provided', async () => {
    const DocDivider = (await import('../primitives/DocDivider')).default
    const result = renderProps(DocDivider, { color: 'red', thickness: 2, children: null })
    expect(result._documentProps.color).toBe('red')
    expect(result._documentProps.thickness).toBe(2)
  })

  it('omits color and thickness when not provided', async () => {
    const DocDivider = (await import('../primitives/DocDivider')).default
    const result = renderProps(DocDivider, { children: null })
    expect(result._documentProps).toEqual({})
  })
})

// --------------------------------------------------------
// DocPage (Element-based)
// --------------------------------------------------------
describe('DocPage attrs', () => {
  it('sets tag to div', async () => {
    const DocPage = (await import('../primitives/DocPage')).default
    const result = renderProps(DocPage, { children: 'page' })
    expect(result.tag).toBe('div')
  })

  it('passes size and orientation when provided', async () => {
    const DocPage = (await import('../primitives/DocPage')).default
    const result = renderProps(DocPage, {
      size: 'A4',
      orientation: 'landscape',
      children: 'page',
    })
    expect(result._documentProps.size).toBe('A4')
    expect(result._documentProps.orientation).toBe('landscape')
  })

  it('omits size and orientation when not provided', async () => {
    const DocPage = (await import('../primitives/DocPage')).default
    const result = renderProps(DocPage, { children: 'page' })
    expect(result._documentProps).toEqual({})
  })
})

// --------------------------------------------------------
// DocPageBreak (Element-based)
// --------------------------------------------------------
describe('DocPageBreak attrs', () => {
  it('sets tag to div with empty _documentProps', async () => {
    const DocPageBreak = (await import('../primitives/DocPageBreak')).default
    const result = renderProps(DocPageBreak, { children: null })
    expect(result.tag).toBe('div')
    expect(result._documentProps).toEqual({})
  })
})

// --------------------------------------------------------
// DocQuote (Element-based)
// --------------------------------------------------------
describe('DocQuote attrs', () => {
  it('sets tag to blockquote', async () => {
    const DocQuote = (await import('../primitives/DocQuote')).default
    const result = renderProps(DocQuote, { children: 'quote' })
    expect(result.tag).toBe('blockquote')
  })

  it('passes borderColor when provided', async () => {
    const DocQuote = (await import('../primitives/DocQuote')).default
    const result = renderProps(DocQuote, { borderColor: '#ff0000', children: 'quote' })
    expect(result._documentProps.borderColor).toBe('#ff0000')
  })

  it('has empty _documentProps when no borderColor', async () => {
    const DocQuote = (await import('../primitives/DocQuote')).default
    const result = renderProps(DocQuote, { children: 'quote' })
    expect(result._documentProps).toEqual({})
  })
})

// --------------------------------------------------------
// DocRow (Element-based)
// --------------------------------------------------------
describe('DocRow attrs', () => {
  it('sets tag to div with empty _documentProps', async () => {
    const DocRow = (await import('../primitives/DocRow')).default
    const result = renderProps(DocRow, { children: null })
    expect(result.tag).toBe('div')
    expect(result._documentProps).toEqual({})
  })
})

// --------------------------------------------------------
// DocColumn (Element-based)
// --------------------------------------------------------
describe('DocColumn attrs', () => {
  it('sets tag to div', async () => {
    const DocColumn = (await import('../primitives/DocColumn')).default
    const result = renderProps(DocColumn, { children: null })
    expect(result.tag).toBe('div')
  })

  it('passes width to _documentProps when provided', async () => {
    const DocColumn = (await import('../primitives/DocColumn')).default
    const result = renderProps(DocColumn, { width: '50%', children: null })
    expect(result._documentProps.width).toBe('50%')
  })

  it('has empty _documentProps when no width', async () => {
    const DocColumn = (await import('../primitives/DocColumn')).default
    const result = renderProps(DocColumn, { children: null })
    expect(result._documentProps).toEqual({})
  })
})

// --------------------------------------------------------
// DocSpacer (Element-based)
// --------------------------------------------------------
describe('DocSpacer attrs', () => {
  it('sets tag to div', async () => {
    const DocSpacer = (await import('../primitives/DocSpacer')).default
    const result = renderProps(DocSpacer, { children: null })
    expect(result.tag).toBe('div')
  })

  it('defaults height to 16', async () => {
    const DocSpacer = (await import('../primitives/DocSpacer')).default
    const result = renderProps(DocSpacer, { children: null })
    expect(result._documentProps.height).toBe(16)
  })

  it('passes custom height', async () => {
    const DocSpacer = (await import('../primitives/DocSpacer')).default
    const result = renderProps(DocSpacer, { height: 32, children: null })
    expect(result._documentProps.height).toBe(32)
  })
})

// --------------------------------------------------------
// DocSection (Element-based)
// --------------------------------------------------------
describe('DocSection attrs', () => {
  it('sets tag to div', async () => {
    const DocSection = (await import('../primitives/DocSection')).default
    const result = renderProps(DocSection, { children: null })
    expect(result.tag).toBe('div')
  })

  it('defaults direction to column', async () => {
    const DocSection = (await import('../primitives/DocSection')).default
    const result = renderProps(DocSection, { children: null })
    expect(result._documentProps.direction).toBe('column')
  })

  it('passes direction when provided', async () => {
    const DocSection = (await import('../primitives/DocSection')).default
    const result = renderProps(DocSection, { direction: 'row', children: null })
    expect(result._documentProps.direction).toBe('row')
  })
})

// --------------------------------------------------------
// DocButton (Text-based: tag -> as)
// --------------------------------------------------------
describe('DocButton attrs', () => {
  it('sets tag to a', async () => {
    const DocButton = (await import('../primitives/DocButton')).default
    const result = renderProps(DocButton, { children: 'Click' })
    expect(result.as).toBe('a')
  })

  it('passes href to _documentProps', async () => {
    const DocButton = (await import('../primitives/DocButton')).default
    const result = renderProps(DocButton, { href: 'https://example.com', children: 'Click' })
    expect(result._documentProps.href).toBe('https://example.com')
  })

  it('defaults href to # when not provided', async () => {
    const DocButton = (await import('../primitives/DocButton')).default
    const result = renderProps(DocButton, { children: 'Click' })
    expect(result._documentProps.href).toBe('#')
  })
})

// --------------------------------------------------------
// DocumentPreview (Element-based)
// --------------------------------------------------------
describe('DocumentPreview attrs', () => {
  it('sets tag to div', async () => {
    const DocumentPreview = (await import('../DocumentPreview')).default
    const result = renderProps(DocumentPreview, { children: null })
    expect(result.tag).toBe('div')
  })

  it('defaults size to A4 when not provided', async () => {
    const DocumentPreview = (await import('../DocumentPreview')).default
    const result = renderProps(DocumentPreview, { children: null })
    expect(result._documentProps.size).toBe('A4')
  })

  it('passes custom size', async () => {
    const DocumentPreview = (await import('../DocumentPreview')).default
    const result = renderProps(DocumentPreview, { size: 'letter', children: null })
    expect(result._documentProps.size).toBe('letter')
  })

  it('passes showPageBreaks when provided', async () => {
    const DocumentPreview = (await import('../DocumentPreview')).default
    const result = renderProps(DocumentPreview, { showPageBreaks: true, children: null })
    expect(result._documentProps.showPageBreaks).toBe(true)
  })
})

// --------------------------------------------------------
// All primitives: displayName and IS_ROCKETSTYLE coverage
// --------------------------------------------------------
describe('all primitives have correct displayName and IS_ROCKETSTYLE', () => {
  const primitivePairs = [
    ['DocButton', '../primitives/DocButton'],
    ['DocCode', '../primitives/DocCode'],
    ['DocColumn', '../primitives/DocColumn'],
    ['DocDivider', '../primitives/DocDivider'],
    ['DocDocument', '../primitives/DocDocument'],
    ['DocHeading', '../primitives/DocHeading'],
    ['DocImage', '../primitives/DocImage'],
    ['DocLink', '../primitives/DocLink'],
    ['DocList', '../primitives/DocList'],
    ['DocListItem', '../primitives/DocListItem'],
    ['DocPage', '../primitives/DocPage'],
    ['DocPageBreak', '../primitives/DocPageBreak'],
    ['DocQuote', '../primitives/DocQuote'],
    ['DocRow', '../primitives/DocRow'],
    ['DocSection', '../primitives/DocSection'],
    ['DocSpacer', '../primitives/DocSpacer'],
    ['DocTable', '../primitives/DocTable'],
    ['DocText', '../primitives/DocText'],
  ] as const

  for (const [name, path] of primitivePairs) {
    it(`${name} has displayName = "${name}"`, async () => {
      const mod = await import(path)
      expect(mod.default.displayName).toBe(name)
    })

    it(`${name} is a function`, async () => {
      const mod = await import(path)
      expect(typeof mod.default).toBe('function')
    })

    it(`${name} has IS_ROCKETSTYLE = true`, async () => {
      const mod = await import(path)
      expect(mod.default.IS_ROCKETSTYLE).toBe(true)
    })
  }
})
