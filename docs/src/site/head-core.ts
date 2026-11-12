import { type MetaTag, useHead } from '@pyreon/head'

/** Production origin: canonical, Open Graph and JSON-LD URLs must be absolute. */
export const SITE_ORIGIN = 'https://pyreon.dev'
export const SITE_NAME = 'Pyreon'

export interface PageHeadInput {
  /** Root-relative path of the page, e.g. `/products/form`. Drives canonical, `og:url` and the share image. */
  path: string
  /** The `<title>` (also `og:title` / `twitter:title`). */
  title: string
  /** One or two sentences (`description`, `og:description`, `twitter:description`). */
  description: string
  /** `og:type`. Default `website`; a post is `article`. */
  type?: 'website' | 'article' | undefined
  /** The share image (an absolute URL and its size and alt). */
  image: { url: string; width: number; height: number; alt: string }
  /** Canonical URL when it is not this page (a redirect page points at its target). */
  canonical?: string | undefined
  /** Keep the page out of search results. */
  noindex?: boolean | undefined
  /** Structured data for the page (`<script type="application/ld+json">`). */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[] | undefined
  /** Any further `<meta>` tags (a refresh, `article:published_time`, …). */
  meta?: MetaTag[] | undefined
}

/** The tags `usePageHead` writes, as data (exported for the unit test). */
export function pageHeadTags(input: PageHeadInput): { title: string; meta: MetaTag[]; link: { rel: string; href: string }[] } {
  const url = `${SITE_ORIGIN}${input.path === '/' ? '/' : input.path.replace(/\/$/, '')}`
  const image = input.image
  return {
    title: input.title,
    meta: [
      { name: 'description', content: input.description },
      { property: 'og:type', content: input.type ?? 'website' },
      { property: 'og:site_name', content: SITE_NAME },
      { property: 'og:url', content: url },
      { property: 'og:title', content: input.title },
      { property: 'og:description', content: input.description },
      { property: 'og:image', content: image.url },
      { property: 'og:image:width', content: String(image.width) },
      { property: 'og:image:height', content: String(image.height) },
      { property: 'og:image:alt', content: image.alt },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: input.title },
      { name: 'twitter:description', content: input.description },
      { name: 'twitter:image', content: image.url },
      { name: 'twitter:image:alt', content: image.alt },
      ...(input.noindex ? [{ name: 'robots', content: 'noindex' }] : []),
      ...(input.meta ?? []),
    ],
    link: [{ rel: 'canonical', href: input.canonical ?? url }],
  }
}

/**
 * The tags of `pageHeadTags` through `useHead`, with an explicit share image.
 * Pages use `usePageHead` (`head.ts`), which picks the image from the asset
 * set; this core takes no asset data, for code every page's client bundle
 * carries (the 404 the router keeps for unknown URLs).
 */
export function usePageHeadWith(input: PageHeadInput): void {
  useHead({ ...pageHeadTags(input), ...(input.jsonLd ? { jsonLd: input.jsonLd } : {}) })
}
