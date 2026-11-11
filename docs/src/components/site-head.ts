import { useHead, type MetaTag } from '@pyreon/head'
import { SITE_ORIGIN } from '../blog/site'

export interface PageHead {
  /** Root-relative path, e.g. `/open`. */
  path: string
  title: string
  description: string
  /** Extra `<meta>` tags, e.g. a refresh or `robots`. */
  meta?: MetaTag[]
  /** Canonical URL; defaults to this page on pyreon.dev. */
  canonical?: string
}

/**
 * Title, description, Open Graph and canonical for a standalone site page.
 * The same keys `_layout.tsx` sets as defaults, so these REPLACE them (the
 * innermost `useHead` wins per key), the way the blog pages do.
 */
export function usePageHead(head: PageHead): void {
  const url = `${SITE_ORIGIN}${head.path}`
  useHead({
    title: head.title,
    meta: [
      { name: 'description', content: head.description },
      { property: 'og:url', content: url },
      { property: 'og:title', content: head.title },
      { property: 'og:description', content: head.description },
      { name: 'twitter:title', content: head.title },
      { name: 'twitter:description', content: head.description },
      ...(head.meta ?? []),
    ],
    link: [{ rel: 'canonical', href: head.canonical ?? url }],
  })
}
