import { describe, expect, it } from 'vitest'
import styles from '../styles/styles/index'

const mockCss = (strings: TemplateStringsArray, ...vals: any[]) => {
  let r = ''
  for (let i = 0; i < strings.length; i++) {
    r += strings[i]
    if (i < vals.length) r += String(vals[i])
  }
  return r
}

describe('styles', () => {
  it('empty theme produces no CSS properties (all fragments are empty)', () => {
    const result = styles({ theme: {}, css: mockCss, rootSize: 16 })
    // The result is a css`` template result with empty fragments — it
    // contains template whitespace but no actual CSS property declarations.
    // Trim and strip commas/whitespace to verify no real CSS is produced.
    const cleaned = String(result).replace(/[,\s]/g, '')
    expect(cleaned).toBe('')
  })

  it('single simple property: color', () => {
    const result = styles({ theme: { color: 'red' }, css: mockCss, rootSize: 16 })
    expect(result).toContain('color: red;')
  })

  it('simple property: display', () => {
    const result = styles({ theme: { display: 'flex' }, css: mockCss, rootSize: 16 })
    expect(result).toContain('display: flex;')
  })

  it('convert property: width converts via value() with rootSize', () => {
    // width is a convert_fallback with keys ["width", "size"]
    // 160 / 16 = 10rem
    const result = styles({ theme: { width: 160 }, css: mockCss, rootSize: 16 })
    expect(result).toContain('width:')
    expect(result).toContain('10rem')
  })

  it('convert property: fontSize', () => {
    // 32 / 16 = 2rem
    const result = styles({ theme: { fontSize: 32 }, css: mockCss, rootSize: 16 })
    expect(result).toContain('font-size:')
    expect(result).toContain('2rem')
  })

  it('edge property: margin generates margin shorthand', () => {
    // margin 16 / 16 = 1rem
    const result = styles({ theme: { margin: 16 }, css: mockCss, rootSize: 16 })
    expect(result).toContain('margin:')
    expect(result).toContain('1rem')
  })

  it('edge property: padding', () => {
    const result = styles({ theme: { padding: 8 }, css: mockCss, rootSize: 16 })
    expect(result).toContain('padding:')
    expect(result).toContain('0.5rem')
  })

  it('border radius: borderRadius generates border-radius', () => {
    // 8 / 16 = 0.5rem
    const result = styles({ theme: { borderRadius: 8 }, css: mockCss, rootSize: 16 })
    expect(result).toContain('border-radius:')
    expect(result).toContain('0.5rem')
  })

  it('multiple properties combined', () => {
    const result = styles({
      theme: { color: 'blue', display: 'flex', fontSize: 16 },
      css: mockCss,
      rootSize: 16,
    })
    expect(result).toContain('color: blue;')
    expect(result).toContain('display: flex;')
    expect(result).toContain('font-size: 1rem;')
  })

  it('special property: fullScreen', () => {
    const result = styles({ theme: { fullScreen: true }, css: mockCss, rootSize: 16 })
    expect(result).toContain('position: fixed;')
    expect(result).toContain('top: 0;')
    expect(result).toContain('left: 0;')
    expect(result).toContain('right: 0;')
    expect(result).toContain('bottom: 0;')
  })

  it('special property: fullScreen false produces no output', () => {
    const result = styles({ theme: { fullScreen: false }, css: mockCss, rootSize: 16 })
    expect(result).not.toContain('position: fixed;')
  })

  it('special property: backgroundImage', () => {
    const result = styles({
      theme: { backgroundImage: 'https://example.com/img.png' },
      css: mockCss,
      rootSize: 16,
    })
    expect(result).toContain('background-image: url(https://example.com/img.png);')
  })

  it('special property: hideEmpty', () => {
    const result = styles({ theme: { hideEmpty: true }, css: mockCss, rootSize: 16 })
    // CSS template output — normalize whitespace for comparison
    const normalized = String(result).replace(/\s+/g, ' ')
    expect(normalized).toContain('&:empty { display: none; }')
  })

  it('special property: clearFix', () => {
    const result = styles({ theme: { clearFix: true }, css: mockCss, rootSize: 16 })
    const normalized = String(result).replace(/\s+/g, ' ')
    expect(normalized).toContain("&::after { clear: both; content: ''; display: table; }")
  })

  it('string values for convert properties pass through', () => {
    const result = styles({ theme: { width: '50%' }, css: mockCss, rootSize: 16 })
    expect(result).toContain('width: 50%;')
  })

  it('uses default rootSize when not provided', () => {
    // default rootSize is undefined, value() defaults to 16
    const result = styles({ theme: { fontSize: 32 }, css: mockCss })
    expect(result).toContain('font-size:')
    expect(result).toContain('2rem')
  })
})
