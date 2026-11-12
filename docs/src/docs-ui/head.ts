import type { UseHeadInput } from '@pyreon/head'
import { SITE_ORIGIN } from './actions'
import { normalizeDocsPath, trailOf } from './nav'

export interface ShareCard {
  image: string
  alt: string
}
export interface DocsShareCards {
  pages: Record<string, ShareCard>
  groups: Record<string, ShareCard>
}

/** The page's own card, else its sidebar group's card, else the docs card. Pure; exported for tests. */
export function shareCardOf(path: string, cards: DocsShareCards): ShareCard | undefined {
  const p = normalizeDocsPath(path)
  const group = trailOf(p)?.group.group
  return cards.pages[p] ?? (group ? cards.groups[group] : undefined) ?? cards.pages['/docs']
}

/** Lazy: the share-card map is only read while the head is built. */
export const loadShareCards = async (): Promise<DocsShareCards> =>
  (await import('../site/content/_docs-og.json')).default as DocsShareCards

/**
 * Title, description, canonical, Open Graph and Twitter tags for a docs page.
 * The keys match the root layout's defaults, so these replace them.
 */
export function docsHead(page: { path: string; title: string; description?: string | undefined }, cards?: DocsShareCards): UseHeadInput {
  const path = normalizeDocsPath(page.path)
  const url = `${SITE_ORIGIN}${path}`
  const title = path === '/docs' ? page.title : `${page.title} · Pyreon docs`
  const description = page.description ?? `${page.title}: Pyreon documentation.`
  const card = cards ? shareCardOf(path, cards) : undefined
  const meta: NonNullable<UseHeadInput['meta']> = [
    { name: 'description', content: description },
    { property: 'og:type', content: 'article' },
    { property: 'og:url', content: url },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { name: 'twitter:card', content: 'summary_large_image' },
  ]
  if (card) {
    meta.push(
      { property: 'og:image', content: `${SITE_ORIGIN}${card.image}` },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: card.alt },
      { name: 'twitter:image', content: `${SITE_ORIGIN}${card.image}` },
      { name: 'twitter:image:alt', content: card.alt },
    )
  }
  return { title, meta, link: [{ rel: 'canonical', href: url }] }
}
