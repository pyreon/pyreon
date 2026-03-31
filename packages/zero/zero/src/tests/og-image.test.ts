import { describe, expect, it } from 'vitest'
import { buildTextOverlaySvg, ogImagePath, ogImagePlugin } from '../og-image'

describe('ogImagePath', () => {
  it('returns path without locale', () => {
    expect(ogImagePath('default')).toBe('/og/default.png')
  })

  it('returns path with locale', () => {
    expect(ogImagePath('default', 'de')).toBe('/og/default-de.png')
  })

  it('respects custom outDir', () => {
    expect(ogImagePath('hero', 'en', 'images')).toBe('/images/hero-en.png')
  })

  it('handles jpeg format', () => {
    expect(ogImagePath('photo', 'fr', 'og', 'jpeg')).toBe('/og/photo-fr.jpg')
  })

  it('returns png by default', () => {
    expect(ogImagePath('card', undefined, 'og', 'png')).toBe('/og/card.png')
  })
})

describe('buildTextOverlaySvg', () => {
  it('produces valid SVG with text elements', () => {
    const svg = buildTextOverlaySvg(
      [{ text: 'Hello World', fontSize: 48 }],
      1200,
      630,
      'en',
    )

    expect(svg).toContain('<svg')
    expect(svg).toContain('width="1200"')
    expect(svg).toContain('height="630"')
    expect(svg).toContain('Hello World')
    expect(svg).toContain('font-size="48"')
  })

  it('resolves locale-specific text from record', () => {
    const svg = buildTextOverlaySvg(
      [{ text: { en: 'Hello', de: 'Hallo' } }],
      1200, 630, 'de',
    )
    expect(svg).toContain('Hallo')
    expect(svg).not.toContain('Hello')
  })

  it('resolves locale-specific text from function', () => {
    const svg = buildTextOverlaySvg(
      [{ text: (locale: string) => locale === 'cs' ? 'Ahoj' : 'Hi' }],
      1200, 630, 'cs',
    )
    expect(svg).toContain('Ahoj')
  })

  it('uses static text string for all locales', () => {
    const svg = buildTextOverlaySvg(
      [{ text: 'pyreon.dev' }],
      1200, 630, 'de',
    )
    expect(svg).toContain('pyreon.dev')
  })

  it('positions text using percentage values', () => {
    const svg = buildTextOverlaySvg(
      [{ text: 'Test', x: '25%', y: '75%' }],
      1200, 630, 'en',
    )
    // 25% of 1200 = 300, 75% of 630 = 473 (rounded)
    expect(svg).toContain('x="300"')
    expect(svg).toContain('y="473"')
  })

  it('positions text using pixel values', () => {
    const svg = buildTextOverlaySvg(
      [{ text: 'Test', x: 100, y: 200 }],
      1200, 630, 'en',
    )
    expect(svg).toContain('x="100"')
    expect(svg).toContain('y="200"')
  })

  it('applies custom styling', () => {
    const svg = buildTextOverlaySvg(
      [{
        text: 'Styled',
        color: '#ff0000',
        fontFamily: 'Inter',
        fontWeight: '600',
        textAnchor: 'start',
      }],
      1200, 630, 'en',
    )
    expect(svg).toContain('fill="#ff0000"')
    expect(svg).toContain('font-family="Inter"')
    expect(svg).toContain('font-weight="600"')
    expect(svg).toContain('text-anchor="start"')
  })

  it('handles multiple layers', () => {
    const svg = buildTextOverlaySvg(
      [
        { text: 'Title', fontSize: 72, y: '30%' },
        { text: 'Subtitle', fontSize: 36, y: '60%' },
      ],
      1200, 630, 'en',
    )
    expect(svg).toContain('Title')
    expect(svg).toContain('Subtitle')
    expect(svg).toContain('font-size="72"')
    expect(svg).toContain('font-size="36"')
  })

  it('wraps long text into multiple tspan elements', () => {
    const longText = 'This is a very long text that should wrap into multiple lines when it exceeds the maximum width'
    const svg = buildTextOverlaySvg(
      [{ text: longText, maxWidth: 400, fontSize: 32 }],
      1200, 630, 'en',
    )
    // Multiple tspan elements = text wrapping
    const tspanCount = (svg.match(/<tspan/g) ?? []).length
    expect(tspanCount).toBeGreaterThan(1)
  })

  it('escapes XML special characters', () => {
    const svg = buildTextOverlaySvg(
      [{ text: 'A & B <C>' }],
      1200, 630, 'en',
    )
    expect(svg).toContain('A &amp; B &lt;C&gt;')
    expect(svg).not.toContain('A & B <C>')
  })

  it('falls back to first locale in record when current locale missing', () => {
    const svg = buildTextOverlaySvg(
      [{ text: { en: 'English', de: 'Deutsch' } }],
      1200, 630, 'fr',
    )
    // Falls back to first key ('en')
    expect(svg).toContain('English')
  })
})

describe('ogImagePlugin', () => {
  it('returns a Vite plugin with correct name', () => {
    const plugin = ogImagePlugin({
      templates: [{ name: 'default', background: { color: '#000' } }],
    }) as any
    expect(plugin.name).toBe('pyreon-zero-og-image')
  })

  it('has configureServer and generateBundle hooks', () => {
    const plugin = ogImagePlugin({
      templates: [{ name: 'default', background: { color: '#000' } }],
    }) as any
    expect(typeof plugin.configureServer).toBe('function')
    expect(typeof plugin.generateBundle).toBe('function')
  })

  it('has enforce: pre', () => {
    const plugin = ogImagePlugin({
      templates: [{ name: 'default', background: { color: '#000' } }],
    }) as any
    expect(plugin.enforce).toBe('pre')
  })
})
