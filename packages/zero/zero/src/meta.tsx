import type { VNodeChild } from '@pyreon/core'

// ─── Meta component ────────────────────────────────────────────────────────
//
// Declarative <Meta> component for managing page-level metadata:
// - Title, description, canonical URL
// - Open Graph (og:title, og:image, etc.)
// - Twitter Cards
// - Structured data (JSON-LD)
// - Robots directives
//
// Uses @pyreon/head under the hood for SSR-compatible head management.

export interface MetaProps {
  /** Page title. Also sets og:title and twitter:title. */
  title?: string
  /** Page description. Also sets og:description and twitter:description. */
  description?: string
  /** Canonical URL. Also sets og:url. */
  canonical?: string
  /** Open Graph image URL. Also sets twitter:image. */
  image?: string
  /** Image alt text for accessibility. */
  imageAlt?: string
  /** Open Graph type. Default: "website" */
  type?: 'website' | 'article' | 'product' | 'profile'
  /** Site name for og:site_name. */
  siteName?: string
  /** Twitter card type. Default: "summary_large_image" */
  twitterCard?: 'summary' | 'summary_large_image' | 'app' | 'player'
  /** Twitter @handle. */
  twitterSite?: string
  /** Twitter creator @handle. */
  twitterCreator?: string
  /** Locale. Default: "en_US" */
  locale?: string
  /** Alternate locales for hreflang. */
  alternateLocales?: Array<{ locale: string; url: string }>
  /** Robots directives. Default: "index, follow" */
  robots?: string
  /** Published time (ISO 8601) for article type. */
  publishedTime?: string
  /** Modified time (ISO 8601) for article type. */
  modifiedTime?: string
  /** Article author. */
  author?: string
  /** Article tags. */
  tags?: string[]
  /** JSON-LD structured data object. */
  jsonLd?: Record<string, unknown>
  /** Additional custom meta tags. */
  extra?: Array<{ name?: string; property?: string; content: string }>
  children?: VNodeChild
}

/**
 * Declarative meta component for SSR-compatible page metadata.
 *
 * Sets title, description, Open Graph, Twitter Cards, canonical URL,
 * JSON-LD structured data, and robots in a single component.
 *
 * @example
 * ```tsx
 * <Meta
 *   title="My Page"
 *   description="Page description"
 *   image="/og-image.jpg"
 *   canonical="https://example.com/page"
 * />
 * ```
 *
 * @example
 * ```tsx
 * // Article with structured data
 * <Meta
 *   title="Blog Post"
 *   description="A great blog post"
 *   type="article"
 *   publishedTime="2026-01-15"
 *   author="Vit Bokisch"
 *   jsonLd={{
 *     "@type": "Article",
 *     headline: "Blog Post",
 *     author: { "@type": "Person", name: "Vit Bokisch" },
 *   }}
 * />
 * ```
 */
export function Meta(props: MetaProps): VNodeChild {
  // Lazy import to avoid circular deps and allow tree-shaking
  // when @pyreon/head is not installed
  let useHead: ((opts: any) => void) | undefined
  try {
    const head = require('@pyreon/head')
    useHead = head.useHead
  } catch {
    // @pyreon/head not available — render meta tags directly
  }

  const tags = buildMetaTags(props)

  if (useHead) {
    useHead({
      title: props.title,
      meta: tags.meta,
      link: tags.link,
      script: tags.script,
    })
    return props.children ?? null
  }

  // Fallback: return nothing (tags need @pyreon/head for injection)
  return props.children ?? null
}

interface MetaTags {
  meta: Array<Record<string, string>>
  link: Array<Record<string, string>>
  script: Array<{ type: string; children: string }>
}

function buildMetaTags(props: MetaProps): MetaTags {
  const meta: Array<Record<string, string>> = []
  const link: Array<Record<string, string>> = []
  const script: Array<{ type: string; children: string }> = []

  const {
    title,
    description,
    canonical,
    image,
    imageAlt,
    type = 'website',
    siteName,
    twitterCard = 'summary_large_image',
    twitterSite,
    twitterCreator,
    locale = 'en_US',
    alternateLocales,
    robots = 'index, follow',
    publishedTime,
    modifiedTime,
    author,
    tags,
    jsonLd,
    extra,
  } = props

  // Basic meta
  if (description) meta.push({ name: 'description', content: description })
  if (robots) meta.push({ name: 'robots', content: robots })
  if (author) meta.push({ name: 'author', content: author })

  // Open Graph
  if (title) meta.push({ property: 'og:title', content: title })
  if (description) meta.push({ property: 'og:description', content: description })
  if (canonical) meta.push({ property: 'og:url', content: canonical })
  if (image) meta.push({ property: 'og:image', content: image })
  if (imageAlt) meta.push({ property: 'og:image:alt', content: imageAlt })
  meta.push({ property: 'og:type', content: type })
  if (siteName) meta.push({ property: 'og:site_name', content: siteName })
  meta.push({ property: 'og:locale', content: locale })

  // Article-specific
  if (type === 'article') {
    if (publishedTime) meta.push({ property: 'article:published_time', content: publishedTime })
    if (modifiedTime) meta.push({ property: 'article:modified_time', content: modifiedTime })
    if (author) meta.push({ property: 'article:author', content: author })
    if (tags) {
      for (const tag of tags) {
        meta.push({ property: 'article:tag', content: tag })
      }
    }
  }

  // Twitter Cards
  meta.push({ name: 'twitter:card', content: twitterCard })
  if (title) meta.push({ name: 'twitter:title', content: title })
  if (description) meta.push({ name: 'twitter:description', content: description })
  if (image) meta.push({ name: 'twitter:image', content: image })
  if (imageAlt) meta.push({ name: 'twitter:image:alt', content: imageAlt })
  if (twitterSite) meta.push({ name: 'twitter:site', content: twitterSite })
  if (twitterCreator) meta.push({ name: 'twitter:creator', content: twitterCreator })

  // Canonical + alternate locales
  if (canonical) link.push({ rel: 'canonical', href: canonical })
  if (alternateLocales) {
    for (const alt of alternateLocales) {
      link.push({ rel: 'alternate', hreflang: alt.locale, href: alt.url })
    }
  }

  // JSON-LD
  if (jsonLd) {
    script.push({
      type: 'application/ld+json',
      children: JSON.stringify({ '@context': 'https://schema.org', ...jsonLd }),
    })
  }

  // Custom extra tags
  if (extra) {
    for (const tag of extra) {
      meta.push(tag)
    }
  }

  return { meta, link, script }
}

/**
 * Build meta tags for programmatic use (SSR, API).
 * Returns arrays of meta/link/script objects ready for head injection.
 */
export { buildMetaTags }
