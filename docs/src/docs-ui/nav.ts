// `_docs.json#sidebar` on its own (scripts/sync-docs-content.ts writes it):
// every docs page carries the sidebar, and only the sidebar.
import indexJson from '../site/content/_docs-index.json'
import sidebarJson from '../site/content/_docs-sidebar.json'
import type { DocsNav, DocsSidebarItem, SidebarBadge } from '../site/content/types-site'

/**
 * The docs navigation, from the content set's `_docs.json` (synced by
 * `scripts/sync-docs-content.ts`, never edited here): the sidebar groups
 * (Get started · Build · Data and state · Visual and content · Developer
 * tools · Guides · Migrate · Reference), each page once, product items with
 * their glyph and a sourced badge, and the per-product overview slots.
 *
 * Everything else the docs shell needs (prev/next, breadcrumbs, the drawer
 * label, the rail's product) is derived here from that one order.
 */
export type SidebarGroup = DocsNav['sidebar'][number]
export type Overview = DocsNav['overviews'][number]
export type { DocsSidebarItem, SidebarBadge }

export const SIDEBAR: readonly SidebarGroup[] = sidebarJson as SidebarGroup[]

/** `/docs/x/` and `/docs/x#h` → `/docs/x`; `/docs/index` is the docs home. */
export function normalizeDocsPath(path: string): string {
  let p = path.split(/[?#]/)[0] ?? ''
  if (p.length > 1) p = p.replace(/\/+$/, '')
  if (p === '/docs/index') return '/docs'
  return p
}

/** One sidebar page, where it sits, and the product it documents (if any). */
export interface PageTrail {
  group: SidebarGroup
  item: DocsSidebarItem
  /** The top-level item a child page sits under. */
  parent: DocsSidebarItem | undefined
  /** The product this page belongs to: its own `productId`, or its parent's. */
  productId: string | undefined
}

interface FlatPage extends PageTrail {
  href: string
}

/** Every page in sidebar order, first occurrence wins (a page listed twice keeps its first place). */
export const FLAT: readonly FlatPage[] = (() => {
  const out: FlatPage[] = []
  const seen = new Set<string>()
  const push = (group: SidebarGroup, item: DocsSidebarItem, parent: DocsSidebarItem | undefined) => {
    const href = normalizeDocsPath(item.href)
    if (seen.has(href)) return
    seen.add(href)
    out.push({ href, group, item, parent, productId: item.productId ?? parent?.productId })
  }
  for (const group of SIDEBAR) {
    for (const item of group.items) {
      push(group, item, undefined)
      for (const child of item.children ?? []) push(group, child, item)
    }
  }
  return out
})()

const BY_HREF = new Map(FLAT.map((p, i) => [p.href, i]))

export function trailOf(path: string): PageTrail | undefined {
  const i = BY_HREF.get(normalizeDocsPath(path))
  return i === undefined ? undefined : FLAT[i]
}

export interface PageLink {
  title: string
  href: string
}

/** Previous and next page in sidebar order. */
export function prevNextOf(path: string): { prev: PageLink | undefined; next: PageLink | undefined } {
  const i = BY_HREF.get(normalizeDocsPath(path))
  if (i === undefined) return { prev: undefined, next: undefined }
  const link = (p: FlatPage | undefined): PageLink | undefined => (p ? { title: p.item.title, href: p.href } : undefined)
  return { prev: link(FLAT[i - 1]), next: link(FLAT[i + 1]) }
}

/** True when `href` is the page at `path`, or (for a top-level item) one of its children is. */
export function isActive(item: DocsSidebarItem, path: string): boolean {
  const p = normalizeDocsPath(path)
  if (normalizeDocsPath(item.href) === p) return true
  return (item.children ?? []).some((c) => normalizeDocsPath(c.href) === p)
}

const INDEX = indexJson as { overviewPages: Record<string, string>; rail: Record<string, string> }

/**
 * The product whose overview page `path` is (a product without its own
 * overview page has none: its slots never render on a shared guide).
 */
export function overviewProductAt(path: string): string | undefined {
  return INDEX.overviewPages[normalizeDocsPath(path)]
}

/**
 * The ONE product the right rail suggests: the most relevant OTHER product.
 * A page inside a product's docs gets that product's first cross-sell; a page
 * outside every product gets none (the rail stays reading tools only).
 */
export function railProductOf(path: string): string | undefined {
  const id = trailOf(path)?.productId
  return id === undefined ? undefined : INDEX.rail[id]
}

/** Stable id for a sidebar group heading (`Data and state` → `data-and-state`). */
export const groupId = (group: string): string => group.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** Source path of a docs page, relative to the repo root (edit link, Copy as Markdown). */
export function sourcePathOf(slug: string): string {
  const s = slug === '' || slug === 'index' ? 'index' : slug
  return `docs/src/content/docs/${s}.md`
}
