import { describe, expect, it } from "vitest"
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
