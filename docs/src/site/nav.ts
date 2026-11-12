import { SITE_LINKS } from '../site-links'
import navJson from './content/_nav.json'
import productIndex from './content/products/_index.json'
import type { ProductIndex } from './content/types'
import type { MegaItem, NavMenuItem, SiteLink, SiteNav } from './content/types-site'

/**
 * Navigation for the marketing shell: bar, Products mega menu, Why menu,
 * mobile sheet, footer. The data is the content set's `_nav.json` (synced
 * into `content/`, never edited here); this module only adapts it:
 *
 *   - `showWhen` items are kept when their condition holds in this build
 *     (`SHOWN`): /showcase and /open are pages here; the Discord icon waits
 *     until `/discord` redirects (SITE_LINKS.discord is set).
 *   - `HREF_ALIASES` maps a destination the content names before it exists
 *     onto the page that serves it today.
 *
 * Product ids, names and order come from `content/products/_index.json`; the
 * nav tests check `_nav.json`'s mega menu lists each product exactly once.
 */
export const NAV = navJson as unknown as SiteNav
export const PRODUCTS = (productIndex as ProductIndex).products

/** Destinations `_nav.json` names that live at another path in this app. */
export const HREF_ALIASES: Readonly<Record<string, string>> = {
  // The docs have no quickstart page yet; getting-started is the quickstart.
  '/docs/quickstart': '/docs/getting-started',
}

export const resolveHref = (href: string): string => HREF_ALIASES[href] ?? href

/** `showWhen` conditions, by the href they gate. Unknown conditions hide the item. */
const SHOWN: Readonly<Record<string, boolean>> = {
  '/showcase': true,
  '/open': true,
  '/discord': SITE_LINKS.discord !== null,
}

export function isShown(item: { href?: string | undefined; showWhen?: string | undefined }): boolean {
  if (item.showWhen === undefined) return true
  return item.href !== undefined && SHOWN[item.href] === true
}

export interface NavLink {
  label: string
  href: string
}

/** The plain links of the bar (after the two menus), filtered and resolved. */
export const BAR_LINKS: readonly NavLink[] = NAV.main
  .filter((m): m is { label: string; href: string; showWhen?: string } => 'href' in m)
  .filter(isShown)
  .map((m) => ({ label: m.label, href: resolveHref(m.href) }))

type MenuEntry = Extract<SiteNav['main'][number], { kind: 'menu' }>
const WHY = NAV.main.find((m): m is MenuEntry => 'kind' in m && m.kind === 'menu')
if (!WHY) throw new Error('[Pyreon] _nav.json has no `menu` entry for the Why Pyreon menu.')

/** The "Why Pyreon" dropdown: items, then its small link groups (Compare, Migrate). */
export const WHY_MENU: { label: string; items: readonly NavMenuItem[]; groups: readonly { label: string; items: readonly SiteLink[] }[] } = {
  label: WHY.label,
  items: WHY.items.map((i) => ({ ...i, href: resolveHref(i.href) })),
  groups: WHY.footerOfMenu.map((g) => ({ label: g.label, items: g.items.map((i) => ({ ...i, href: resolveHref(i.href) })) })),
}

export const PRODUCTS_LABEL = (NAV.main.find((m) => 'kind' in m && m.kind === 'mega') ?? { label: 'Products' }).label

export const MEGA_COLUMNS: readonly { id: string; title: string; items: readonly MegaItem[] }[] = NAV.megaMenu.columns
export const MEGA_FOOTER: readonly SiteLink[] = NAV.megaMenu.footer.map((l) => ({ ...l, href: resolveHref(l.href) }))

const action = (kind: SiteNav['actions'][number]['kind']) => NAV.actions.find((a) => a.kind === kind && isShown(a))
const github = action('github')
const discord = action('discord')
const primary = action('primary')

/** Icon links at the right of the bar (GitHub; Discord once it redirects). */
export const ICON_LINKS: readonly { kind: 'github' | 'discord'; href: string; label: string }[] = [
  ...(github?.href ? [{ kind: 'github' as const, href: github.href, label: github.ariaLabel ?? 'GitHub' }] : []),
  ...(discord?.href ? [{ kind: 'discord' as const, href: discord.href, label: discord.ariaLabel ?? 'Discord' }] : []),
]

export const THEME_LABEL = action('theme')?.ariaLabel ?? 'Switch theme'

export const START: NavLink & { command: string | undefined } = {
  label: primary?.label ?? 'Start a project',
  href: resolveHref(primary?.href ?? '/docs/getting-started'),
  command: primary?.command,
}

export const MOBILE = {
  open: NAV.mobile.button.open,
  close: NAV.mobile.button.close,
  big: NAV.mobile.sheet.big.filter(isShown).map((l) => ({ label: l.label, href: resolveHref(l.href) })),
  install: NAV.mobile.sheet.install,
  footer: NAV.mobile.sheet.footer.map((l) => ({ ...l, href: resolveHref(l.href) })),
} as const

export const FOOTER = {
  tagline: NAV.footer.tagline,
  install: NAV.footer.install,
  columns: NAV.footer.columns.map((c) => ({
    title: c.title,
    links: c.links.filter(isShown).map((l) => ({ label: l.label, href: resolveHref(l.href) })),
  })),
  bottom: NAV.footer.bottom,
} as const

export const productHref = (id: string): string => `/products/${id}`
/** Sprite with every product glyph (public/brand/glyphs.svg). */
export const GLYPH_SPRITE = '/brand/glyphs.svg'
export const glyphHref = (id: string): string => `${GLYPH_SPRITE}#g-${id}`

const NAME_BY_ID = new Map(PRODUCTS.map((p) => [p.id, p.name]))

/** Display name of a product, from the content index. */
export function productName(id: string): string {
  const name = NAME_BY_ID.get(id)
  if (name === undefined) throw new Error(`[Pyreon] Unknown product id "${id}". Add it to content/products/_index.json.`)
  return name
}

/** The product id a path shows, if it is a product page. */
export function productIdOf(path: string): string | undefined {
  const m = /^\/products\/([a-z0-9-]+)\/?$/.exec(path)
  return m && NAME_BY_ID.has(m[1] as string) ? m[1] : undefined
}

/** True when `path` is `href` or below it (for aria-current on section links). */
export function isCurrent(path: string, href: string): boolean {
  if (href === '/') return path === '/'
  return path === href || path.startsWith(`${href}/`)
}
