import { type MetaTag, useHead } from '@pyreon/head'
import { shareImage } from './kit/assets'

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
  /** Override the share image (an absolute URL). Default: the asset set's share image for `path`. */
  image?: { url: string; width: number; height: number; alt: string } | undefined
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
  const image = input.image ?? shareImage(input.path)
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
 * Title, description, canonical, Open Graph and Twitter tags for a page: the
 * one head helper every page of the site uses. Call it once in the page
 * component. The tags replace the root layout's defaults by key (the
 * innermost `useHead` wins), so a page sets only what it knows.
 *
 * @example
 * usePageHead({ path: '/products/form', title: 'Forms · Pyreon', description: '…' })
 */
export function usePageHead(input: PageHeadInput): void {
  const tags = pageHeadTags(input)
  useHead({ ...tags, ...(input.jsonLd ? { jsonLd: input.jsonLd } : {}) })
}
