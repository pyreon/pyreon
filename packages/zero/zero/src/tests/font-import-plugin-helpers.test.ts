/**
 * Pure-function unit tests for the `?font` import plugin's helpers.
 * Server-side; no DOM, no Vite, no sharp. Plugin lifecycle tested
 * separately in `font-import-plugin.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import {
  buildFontFace,
  emitFontDescriptorModule,
  fontFormat,
  fontMimeType,
  hashFontFilename,
  inferFontMeta,
  parseFontQueryOverrides,
} from '../font-import-plugin'

describe('fontMimeType', () => {
  it.each([
    ['woff2', 'font/woff2'],
    ['woff', 'font/woff'],
    ['ttf', 'font/ttf'],
    ['otf', 'font/otf'],
    ['eot', 'application/vnd.ms-fontobject'],
  ])('maps .%s → %s', (ext, mime) => {
    expect(fontMimeType(ext)).toBe(mime)
    expect(fontMimeType(`.${ext}`)).toBe(mime)
    expect(fontMimeType(ext.toUpperCase())).toBe(mime)
  })

  it('falls back to font/woff2 for unknown extensions', () => {
    expect(fontMimeType('xyz')).toBe('font/woff2')
  })
})

describe('fontFormat', () => {
  it.each([
    ['woff2', 'woff2'],
    ['woff', 'woff'],
    ['ttf', 'truetype'],
    ['otf', 'opentype'],
    ['eot', 'embedded-opentype'],
  ])('maps .%s → format("%s")', (ext, fmt) => {
    expect(fontFormat(ext)).toBe(fmt)
    expect(fontFormat(`.${ext}`)).toBe(fmt)
    expect(fontFormat(ext.toUpperCase())).toBe(fmt)
  })

  it('falls back to woff2 for unknown extensions', () => {
    expect(fontFormat('xyz')).toBe('woff2')
  })
})

describe('inferFontMeta — family / weight / style extraction', () => {
  it('plain filename: family from stem, default weight + style', () => {
    expect(inferFontMeta('display.woff2')).toEqual({
      family: 'display',
      weight: 400,
      style: 'normal',
    })
  })

  it('hyphenated family with no weight token', () => {
    expect(inferFontMeta('display-bold.woff2')).toEqual({
      family: 'display',
      weight: 700, // 'bold' is a known weight keyword
      style: 'normal',
    })
  })

  it('numeric weight suffix → weight', () => {
    expect(inferFontMeta('inter-700.woff2')).toEqual({
      family: 'inter',
      weight: 700,
      style: 'normal',
    })
  })

  it('italic style suffix', () => {
    expect(inferFontMeta('inter-italic.woff2')).toEqual({
      family: 'inter',
      weight: 400,
      style: 'italic',
    })
  })

  it('weight + style combined', () => {
    expect(inferFontMeta('inter-700-italic.woff2')).toEqual({
      family: 'inter',
      weight: 700,
      style: 'italic',
    })
  })

  it('all known weight keywords', () => {
    const cases: Array<[string, number]> = [
      ['x-thin', 100],
      ['x-hairline', 100],
      ['x-extralight', 200],
      ['x-ultralight', 200],
      ['x-light', 300],
      ['x-normal', 400],
      ['x-regular', 400],
      ['x-medium', 500],
      ['x-semibold', 600],
      ['x-demibold', 600],
      ['x-bold', 700],
      ['x-extrabold', 800],
      ['x-ultrabold', 800],
      ['x-black', 900],
      ['x-heavy', 900],
    ]
    for (const [name, expected] of cases) {
      expect(inferFontMeta(`${name}.woff2`).weight).toBe(expected)
    }
  })

  it('underscore separators also tokenize', () => {
    expect(inferFontMeta('inter_700_italic.woff2')).toEqual({
      family: 'inter',
      weight: 700,
      style: 'italic',
    })
  })

  it('non-CSS-spec numeric weights (e.g. 5) are NOT treated as weights', () => {
    // CSS spec weights are 100-900 in multiples of 100, but the
    // inferred-from-filename heuristic accepts any 3-digit numeric
    // between 100-900. `inter-5.woff2` keeps `5` as part of family.
    expect(inferFontMeta('inter-5.woff2')).toEqual({
      family: 'inter-5',
      weight: 400,
      style: 'normal',
    })
  })

  it('oblique style', () => {
    expect(inferFontMeta('serif-oblique.woff2')).toEqual({
      family: 'serif',
      weight: 400,
      style: 'oblique',
    })
  })

  it('strips full path before parsing', () => {
    expect(inferFontMeta('/abs/path/to/inter-700.woff2')).toEqual({
      family: 'inter',
      weight: 700,
      style: 'normal',
    })
  })
})

describe('parseFontQueryOverrides', () => {
  it('parses family override', () => {
    expect(parseFontQueryOverrides('family=Inter')).toEqual({ family: 'Inter' })
  })

  it('parses weight override', () => {
    expect(parseFontQueryOverrides('weight=700')).toEqual({ weight: 700 })
  })

  it('parses style override', () => {
    expect(parseFontQueryOverrides('style=italic')).toEqual({ style: 'italic' })
  })

  it('parses all three combined', () => {
    expect(parseFontQueryOverrides('family=Inter&weight=700&style=italic')).toEqual({
      family: 'Inter',
      weight: 700,
      style: 'italic',
    })
  })

  it('returns empty object for empty query', () => {
    expect(parseFontQueryOverrides('')).toEqual({})
  })

  it('ignores unrecognized keys', () => {
    expect(parseFontQueryOverrides('foo=bar')).toEqual({})
  })

  it('weight=garbage → ignored (caller falls back to filename inference)', () => {
    expect(parseFontQueryOverrides('weight=abc')).toEqual({})
  })

  it('style=garbage → ignored', () => {
    expect(parseFontQueryOverrides('style=bogus')).toEqual({})
  })

  it('strips leading ? and font marker (matches what plugin passes)', () => {
    // The plugin passes the query AFTER `?` and `font` is implicit in
    // the import. So `font&family=X&weight=700` is what reaches us.
    // The implementation uses URLSearchParams which silently ignores
    // any bare key without a value.
    expect(parseFontQueryOverrides('font&family=X&weight=700')).toEqual({
      family: 'X',
      weight: 700,
    })
  })
})

describe('hashFontFilename', () => {
  it('produces a deterministic hashed name', () => {
    const content = Buffer.from('hello-font-content')
    const a = hashFontFilename(content, '/abs/inter.woff2')
    const b = hashFontFilename(content, '/abs/inter.woff2')
    expect(a).toBe(b)
    expect(a).toMatch(/^inter-[0-9a-f]{8}\.woff2$/)
  })

  it('different content → different hash', () => {
    const a = hashFontFilename(Buffer.from('a'), 'x.woff2')
    const b = hashFontFilename(Buffer.from('b'), 'x.woff2')
    expect(a).not.toBe(b)
  })

  it('same content + different name → identical hash, different stem', () => {
    // Same file at two paths dedups by hash but keeps the source stem.
    const content = Buffer.from('shared-binary')
    const a = hashFontFilename(content, '/a/inter.woff2')
    const b = hashFontFilename(content, '/b/inter.woff2')
    expect(a).toBe(b)
    expect(a).toMatch(/^inter-/)
  })

  it('preserves the file extension', () => {
    expect(hashFontFilename(Buffer.from('x'), 'a.ttf')).toMatch(/\.ttf$/)
    expect(hashFontFilename(Buffer.from('x'), 'a.otf')).toMatch(/\.otf$/)
  })
})

describe('buildFontFace', () => {
  it('builds a complete @font-face rule', () => {
    const css = buildFontFace({
      family: 'inter',
      src: '/assets/fonts/inter-abc123.woff2',
      weight: 700,
      style: 'normal',
      display: 'swap',
      format: 'woff2',
    })
    expect(css).toContain("font-family: 'inter';")
    expect(css).toContain("src: url('/assets/fonts/inter-abc123.woff2') format('woff2');")
    expect(css).toContain('font-weight: 700;')
    expect(css).toContain('font-style: normal;')
    expect(css).toContain('font-display: swap;')
  })

  it('emits all five descriptor declarations (no missing fields)', () => {
    const css = buildFontFace({
      family: 'x',
      src: '/x.woff2',
      weight: 400,
      style: 'italic',
      display: 'optional',
      format: 'woff2',
    })
    expect(css.match(/font-family:/g)).toHaveLength(1)
    expect(css.match(/font-weight:/g)).toHaveLength(1)
    expect(css.match(/font-style:/g)).toHaveLength(1)
    expect(css.match(/font-display:/g)).toHaveLength(1)
    expect(css.match(/src:/g)).toHaveLength(1)
  })

  it('wraps with { } block', () => {
    const css = buildFontFace({
      family: 'a',
      src: '/a.woff2',
      weight: 400,
      style: 'normal',
      display: 'swap',
      format: 'woff2',
    })
    expect(css.startsWith('@font-face {')).toBe(true)
    expect(css.trim().endsWith('}')).toBe(true)
  })
})

describe('emitFontDescriptorModule', () => {
  it('emits a side-effect CSS import + frozen descriptor with toString', () => {
    const js = emitFontDescriptorModule('\0virtual:zero-font-face:/abs.woff2', {
      family: 'inter',
      src: '/assets/fonts/inter-abc.woff2',
      weight: 700,
      style: 'normal',
      display: 'swap',
      type: 'font/woff2',
      fontFace: '@font-face { ... }',
    })
    // Side-effect CSS import
    expect(js).toContain('import "\\u0000virtual:zero-font-face:/abs.woff2"')
    // Descriptor data
    expect(js).toContain('"family":"inter"')
    expect(js).toContain('"weight":700')
    // toString chain
    expect(js).toContain('toString')
    expect(js).toContain('valueOf')
    expect(js).toContain('Symbol.toPrimitive')
    // Frozen
    expect(js).toContain('Object.freeze')
    // Single default export
    expect(js).toContain('export default Object.freeze(_d)')
  })

  it('escapes css virtual id correctly for JSON', () => {
    const js = emitFontDescriptorModule('\0odd "id"', {
      family: 'x',
      src: '/x.woff2',
      weight: 400,
      style: 'normal',
      display: 'swap',
      type: 'font/woff2',
      fontFace: '',
    })
    // JSON.stringify handles escapes; the import statement should be
    // syntactically valid JS.
    expect(js).toContain('import "\\u0000odd \\"id\\""')
  })
})

describe('parseFontQueryOverrides — display', () => {
  it('parses a valid display override', () => {
    expect(parseFontQueryOverrides('display=optional')).toEqual({ display: 'optional' })
    expect(parseFontQueryOverrides('display=block')).toEqual({ display: 'block' })
  })

  it('ignores invalid display values (falls back to the swap default downstream)', () => {
    expect(parseFontQueryOverrides('display=bogus')).toEqual({})
  })

  it('composes with family/weight/style', () => {
    expect(parseFontQueryOverrides('family=Hero&weight=700&display=fallback')).toEqual({
      family: 'Hero',
      weight: 700,
      display: 'fallback',
    })
  })
})
