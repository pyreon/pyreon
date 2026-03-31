import { describe, expect, it } from "vitest"
import { createIcoFromPngs, faviconLinks } from '../favicon'

describe('createIcoFromPngs', () => {
  it('produces valid ICO header bytes', () => {
    // Create minimal fake PNG buffers
    const fakePng16 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const fakePng32 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])

    const ico = createIcoFromPngs([
      { buffer: fakePng16 as Buffer, size: 16 },
      { buffer: fakePng32 as Buffer, size: 32 },
    ])

    // ICO header: reserved = 0x0000, type = 0x0100 (icon, little-endian)
    expect(ico[0]).toBe(0x00) // reserved low
    expect(ico[1]).toBe(0x00) // reserved high
    expect(ico[2]).toBe(0x01) // type low (icon)
    expect(ico[3]).toBe(0x00) // type high
    // Image count = 2 (little-endian)
    expect(ico[4]).toBe(0x02)
    expect(ico[5]).toBe(0x00)
  })

  it('encodes directory entry sizes correctly', () => {
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    const ico = createIcoFromPngs([
      { buffer: fakePng as Buffer, size: 16 },
    ])

    // First directory entry starts at byte 6
    expect(ico[6]).toBe(16) // width
    expect(ico[7]).toBe(16) // height
  })

  it('encodes size 256 as 0 per ICO spec', () => {
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    const ico = createIcoFromPngs([
      { buffer: fakePng as Buffer, size: 256 },
    ])

    // 256 is stored as 0 in ICO format
    expect(ico[6]).toBe(0)  // width
    expect(ico[7]).toBe(0)  // height
  })

  it('includes PNG data after header and directory', () => {
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    const ico = createIcoFromPngs([
      { buffer: fakePng as Buffer, size: 32 },
    ])

    // header(6) + 1 dir entry(16) = 22, data starts there
    expect(ico[22]).toBe(0x89) // PNG magic byte
    expect(ico[23]).toBe(0x50)
    expect(ico.length).toBe(6 + 16 + 4)
  })
})

describe('faviconPlugin', () => {
  it('exports faviconPlugin function', async () => {
    const { faviconPlugin } = await import('../favicon')
    expect(typeof faviconPlugin).toBe('function')
  })

  it('returns a Vite plugin with correct name', async () => {
    const { faviconPlugin } = await import('../favicon')
    const plugin = faviconPlugin({ source: './icon.svg' }) as any
    expect(plugin.name).toBe('pyreon-zero-favicon')
  })

  it('transformIndexHtml injects link tags', async () => {
    const { faviconPlugin } = await import('../favicon')
    const plugin = faviconPlugin({ source: './icon.svg' }) as any
    const tags = plugin.transformIndexHtml()
    expect(tags.length).toBeGreaterThan(0)
    expect(tags.some((t: any) => t.attrs.rel === 'icon')).toBe(true)
    expect(tags.some((t: any) => t.attrs.rel === 'apple-touch-icon')).toBe(true)
    expect(tags.some((t: any) => t.attrs.rel === 'manifest')).toBe(true)
  })

  it('SVG source includes SVG icon link', async () => {
    const { faviconPlugin } = await import('../favicon')
    const plugin = faviconPlugin({ source: './icon.svg' }) as any
    const tags = plugin.transformIndexHtml()
    expect(tags.some((t: any) => t.attrs.type === 'image/svg+xml')).toBe(true)
  })

  it('PNG source does not include SVG icon link', async () => {
    const { faviconPlugin } = await import('../favicon')
    const plugin = faviconPlugin({ source: './icon.png' }) as any
    const tags = plugin.transformIndexHtml()
    expect(tags.some((t: any) => t.attrs.type === 'image/svg+xml')).toBe(false)
  })

  it('respects manifest: false', async () => {
    const { faviconPlugin } = await import('../favicon')
    const plugin = faviconPlugin({ source: './icon.svg', manifest: false }) as any
    const tags = plugin.transformIndexHtml()
    expect(tags.some((t: any) => t.attrs.rel === 'manifest')).toBe(false)
  })

  it('includes theme-color meta', async () => {
    const { faviconPlugin } = await import('../favicon')
    const plugin = faviconPlugin({ source: './icon.svg', themeColor: '#0070f3' }) as any
    const tags = plugin.transformIndexHtml()
    const themeMeta = tags.find((t: any) => t.attrs.name === 'theme-color')
    expect(themeMeta.attrs.content).toBe('#0070f3')
  })
})

describe('faviconLinks', () => {
  const baseConfig = { source: './icon.svg' }
  const localeConfig = {
    source: './icon.svg',
    locales: {
      de: { source: './icon-de.svg' },
      cs: { source: './icon-cs.svg' },
    },
  }

  it('returns base links without locale', () => {
    const links = faviconLinks(undefined, baseConfig)
    expect(links.length).toBeGreaterThan(0)
    expect(links.every((l) => !l.href.startsWith('/de/'))).toBe(true)
    expect(links.some((l) => l.rel === 'icon' && l.type === 'image/svg+xml')).toBe(true)
  })

  it('returns locale-prefixed links for locale with override', () => {
    const links = faviconLinks('de', localeConfig)
    const svgLink = links.find((l) => l.type === 'image/svg+xml')
    expect(svgLink?.href).toBe('/de/favicon.svg')
    expect(links.find((l) => l.sizes === '32x32')?.href).toBe('/de/favicon-32x32.png')
    expect(links.find((l) => l.rel === 'apple-touch-icon')?.href).toBe('/de/apple-touch-icon.png')
  })

  it('returns base links for locale without override', () => {
    const links = faviconLinks('fr', localeConfig)
    expect(links.find((l) => l.type === 'image/svg+xml')?.href).toBe('/favicon.svg')
  })

  it('includes manifest link when not disabled', () => {
    const links = faviconLinks(undefined, baseConfig)
    expect(links.some((l) => l.rel === 'manifest')).toBe(true)
  })

  it('excludes manifest link when disabled', () => {
    const links = faviconLinks(undefined, { ...baseConfig, manifest: false })
    expect(links.some((l) => l.rel === 'manifest')).toBe(false)
  })

  it('handles PNG source (no SVG link)', () => {
    const links = faviconLinks(undefined, { source: './icon.png' })
    expect(links.some((l) => l.type === 'image/svg+xml')).toBe(false)
  })

  it('locale-prefixed manifest link', () => {
    const links = faviconLinks('de', localeConfig)
    expect(links.find((l) => l.rel === 'manifest')?.href).toBe('/de/site.webmanifest')
  })
})
