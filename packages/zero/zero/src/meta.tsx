import type { VNodeChild } from '@pyreon/core'
import { useContext } from '@pyreon/core'
import { useHead } from '@pyreon/head'
import type { I18nRoutingConfig, LocaleContext } from './i18n-routing'
import { LocaleCtx, createLocaleContext, extractLocaleFromPath } from './i18n-routing'

// ─── Meta component ────────────────────────────────────────────────────────

export interface MetaProps {
  /** Page title. Accepts reactive accessor `() => string`. */
  title?: string | (() => string)
  /** Page description. Accepts reactive accessor. */
  description?: string | (() => string)
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
  /**
   * I18n routing config — when provided, auto-generates hreflang alternate
   * links for all locales based on the current path.
   * Also sets og:locale and og:locale:alternate.
   */
  i18n?: I18nRoutingConfig
  /** Base URL for building absolute hreflang URLs. e.g. "https://example.com" */
  origin?: string
  children?: VNodeChild
}

const resolveStr = (v: string | (() => string) | undefined): string | undefined =>
  typeof v === 'function' ? v() : v

/**
 * Declarative meta component for SSR-compatible page metadata.
 *
 * Supports reactive title/description — when passed as `() => string` accessors,
 * they are forwarded to `useHead()` as a reactive getter so updates propagate
 * automatically via signal tracking.
 *
 * @example
 * ```tsx
 * <Meta title="My Page" description="..." image="/og.jpg" canonical="https://..." />
 * ```
 *
 * @example Reactive title
 * ```tsx
 * const count = signal(0)
 * <Meta title={() => `${count()} items`} />
 * ```
 */
export function Meta(props: MetaProps): VNodeChild {
  const hasReactiveTitle = typeof props.title === 'function'
  const hasReactiveDescription = typeof props.description === 'function'

  // If title or description are reactive accessors, pass a getter to useHead
  // so it re-evaluates when the signals change.
  if (hasReactiveTitle || hasReactiveDescription) {
    useHead(() => {
      const title = resolveStr(props.title)
      const description = resolveStr(props.description)
      const tags = buildMetaTags({ ...props, title, description })
      return {
        title,
        meta: tags.meta,
        link: tags.link,
        script: tags.script,
      }
    })
  } else {
    const title = resolveStr(props.title)
    const description = resolveStr(props.description)
    const tags = buildMetaTags({ ...props, title, description })
    useHead({
      title,
      meta: tags.meta,
      link: tags.link,
      script: tags.script,
    })
  }

  return props.children ?? null
}

interface MetaTags {
  meta: Array<Record<string, string>>
  link: Array<Record<string, string>>
  script: Array<{ type: string; children: string }>
}

export function buildMetaTags(
  props: Omit<MetaProps, 'title' | 'description' | 'children'> & {
    title?: string
    description?: string
  },
): MetaTags {
  const meta: Array<Record<string, string>> = []
  const link: Array<Record<string, string>> = []
  const script: Array<{ type: string; children: string }> = []

  const {
    title, description, canonical, image, imageAlt,
    type = 'website', siteName,
    twitterCard = 'summary_large_image', twitterSite, twitterCreator,
    locale = 'en_US', alternateLocales,
    robots = 'index, follow',
    publishedTime, modifiedTime, author, tags, jsonLd, extra,
  } = props

  if (description) meta.push({ name: 'description', content: description })
  if (robots) meta.push({ name: 'robots', content: robots })
  if (author) meta.push({ name: 'author', content: author })

  if (title) meta.push({ property: 'og:title', content: title })
  if (description) meta.push({ property: 'og:description', content: description })
  if (canonical) meta.push({ property: 'og:url', content: canonical })
  if (image) meta.push({ property: 'og:image', content: image })
  if (imageAlt) meta.push({ property: 'og:image:alt', content: imageAlt })
  meta.push({ property: 'og:type', content: type })
  if (siteName) meta.push({ property: 'og:site_name', content: siteName })
  meta.push({ property: 'og:locale', content: locale })

  if (type === 'article') {
    if (publishedTime) meta.push({ property: 'article:published_time', content: publishedTime })
    if (modifiedTime) meta.push({ property: 'article:modified_time', content: modifiedTime })
    if (author) meta.push({ property: 'article:author', content: author })
    if (tags) for (const tag of tags) meta.push({ property: 'article:tag', content: tag })
  }

  meta.push({ name: 'twitter:card', content: twitterCard })
  if (title) meta.push({ name: 'twitter:title', content: title })
  if (description) meta.push({ name: 'twitter:description', content: description })
  if (image) meta.push({ name: 'twitter:image', content: image })
  if (imageAlt) meta.push({ name: 'twitter:image:alt', content: imageAlt })
  if (twitterSite) meta.push({ name: 'twitter:site', content: twitterSite })
  if (twitterCreator) meta.push({ name: 'twitter:creator', content: twitterCreator })

  if (canonical) link.push({ rel: 'canonical', href: canonical })
  if (alternateLocales) {
    for (const alt of alternateLocales) {
      link.push({ rel: 'alternate', hreflang: alt.locale, href: alt.url })
    }
  }

  if (jsonLd) {
    script.push({
      type: 'application/ld+json',
      children: JSON.stringify({ '@context': 'https://schema.org', ...jsonLd }),
    })
  }

  if (extra) for (const tag of extra) meta.push(tag)

  // I18n: auto-generate hreflang alternates from i18nRouting config
  if (props.i18n) {
    const i18nConfig = props.i18n
    const origin = props.origin ?? ''
    const currentPath = canonical?.replace(origin, '') ?? '/'
    const { pathWithoutLocale } = extractLocaleFromPath(
      currentPath,
      i18nConfig.locales,
      i18nConfig.defaultLocale,
    )
    const strategy = i18nConfig.strategy ?? 'prefix-except-default'

    for (const loc of i18nConfig.locales) {
      const localizedPath =
        strategy === 'prefix-except-default' && loc === i18nConfig.defaultLocale
          ? pathWithoutLocale
          : `/${loc}${pathWithoutLocale === '/' ? '' : pathWithoutLocale}`

      link.push({
        rel: 'alternate',
        hreflang: loc,
        href: `${origin}${localizedPath}`,
      })

      // og:locale:alternate for non-current locales
      if (loc !== locale) {
        meta.push({ property: 'og:locale:alternate', content: loc })
      }
    }

    // x-default hreflang pointing to default locale
    link.push({
      rel: 'alternate',
      hreflang: 'x-default',
      href: `${origin}${pathWithoutLocale}`,
    })
  }

  return { meta, link, script }
}
