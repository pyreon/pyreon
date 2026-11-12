import { describe, expect, it } from 'vitest'
import { SITE_LINKS } from '../../site-links'
import { BAR_LINKS, FOOTER, HREF_ALIASES, ICON_LINKS, isCurrent, isShown, MEGA_COLUMNS, MOBILE, productIdOf, PRODUCTS, resolveHref, WHY_MENU } from '../nav'

describe('navigation data (_nav.json + _index.json)', () => {
  const menuIds = MEGA_COLUMNS.flatMap((c) => c.items.map((i) => i.id))

  it('lists every product exactly once in the mega menu, in four columns', () => {
    expect(MEGA_COLUMNS.map((c) => c.title)).toEqual(['Build', 'Data and state', 'Visual and content', 'Developer tools'])
    expect(menuIds).toHaveLength(PRODUCTS.length)
    expect(new Set(menuIds)).toEqual(new Set(PRODUCTS.map((p) => p.id)))
    expect(new Set(menuIds).size).toBe(menuIds.length)
  })

  it('links each menu item to its product page', () => {
    for (const col of MEGA_COLUMNS) for (const item of col.items) expect(item.href).toBe(`/products/${item.id}`)
  })

  it('keeps showWhen items only when their condition holds in this build', () => {
    expect(isShown({ href: '/showcase', showWhen: 'page on main' })).toBe(true)
    expect(isShown({ href: '/somewhere', showWhen: 'later' })).toBe(false)
    expect(isShown({ href: '/docs' })).toBe(true)
    expect(BAR_LINKS.map((l) => l.label)).toContain('Showcase')
  })

  it('routes names the docs do not have yet to the page that serves them', () => {
    expect(resolveHref('/docs/quickstart')).toBe(HREF_ALIASES['/docs/quickstart'])
    expect(JSON.stringify([BAR_LINKS, MOBILE, FOOTER, WHY_MENU])).not.toContain('/docs/quickstart')
  })

  it('has the footer links the site needs', () => {
    const hrefs = FOOTER.columns.flatMap((c) => c.links.map((l) => l.href))
    for (const h of ['/blog', '/showcase', '/open', '/blog/rss.xml', 'https://github.com/pyreon/pyreon']) {
      expect(hrefs).toContain(h)
    }
  })

  it('shows no Discord or newsletter link while their addresses are null', () => {
    // The channel gate (src/site-links.ts) drops them from _nav.json on import.
    expect(SITE_LINKS).toEqual({ discord: null, newsletter: null })
    const all = JSON.stringify([BAR_LINKS, MOBILE, FOOTER, WHY_MENU, ICON_LINKS])
    expect(all).not.toMatch(/\/discord|\/newsletter/)
    expect(ICON_LINKS.map((l) => l.kind)).toEqual(['github'])
    expect(MOBILE.footer.map((l) => l.href)).toEqual(['https://github.com/pyreon/pyreon'])
  })

  it('recognises product paths and section membership', () => {
    expect(productIdOf('/products/form')).toBe('form')
    expect(productIdOf('/products/nope')).toBeUndefined()
    expect(productIdOf('/products')).toBeUndefined()
    expect(isCurrent('/blog/tags/x', '/blog')).toBe(true)
    expect(isCurrent('/blogger', '/blog')).toBe(false)
    expect(isCurrent('/docs', '/')).toBe(false)
  })
})
