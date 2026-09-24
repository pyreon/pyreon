/**
 * `buildMetaTags` — the tags a crawler reads.
 *
 * Every assertion here is about something no browser test can see and no
 * type can catch: the page renders identically whether the hreflang set
 * is right or wrong. A wrong `hreflang` tells Google that a URL serves a
 * locale it does not serve, which de-indexes the correct page rather
 * than throwing anything; a missing `og:image:width` makes the card
 * render at whatever size the scraper guesses. The whole surface fails
 * silently, so a test is the only signal.
 *
 * The hreflang generator is the sharp part. It reconstructs each
 * locale's URL from the canonical by stripping the origin and the
 * current locale prefix — so under `prefix-except-default` the default
 * locale gets the BARE path and every other locale gets a prefix, and
 * getting the root-path case wrong yields `/de/` vs `/de` inconsistently
 * (two URLs, one page, which is the duplicate-content problem hreflang
 * exists to solve).
 */
import { describe, expect, it } from 'vitest'
import { buildMetaTags } from '../meta'

type Tag = { name?: string; property?: string; content?: string }
const prop = (t: { meta: Tag[] }, p: string) =>
  t.meta.filter((m) => m.property === p).map((m) => m.content)
const named = (t: { meta: Tag[] }, n: string) =>
  t.meta.filter((m) => m.name === n).map((m) => m.content)
const alternates = (t: { link: Array<{ rel?: string; hreflang?: string; href?: string }> }) =>
  t.link.filter((l) => l.rel === 'alternate').map((l) => `${l.hreflang}=${l.href}`)

describe('hreflang alternates are generated from the i18n config', () => {
  const i18n = { locales: ['en', 'de', 'fr'], defaultLocale: 'en' }

  it('gives the default locale a BARE path and the others a prefix', () => {
    // The `prefix-except-default` contract. If the default locale also
    // got a prefix, `/blog` and `/en/blog` would both claim `en` and
    // Google picks one arbitrarily.
    const t = buildMetaTags({
      canonical: 'https://x.com/blog',
      origin: 'https://x.com',
      i18n,
    })
    expect(alternates(t)).toEqual([
      'en=https://x.com/blog',
      'de=https://x.com/de/blog',
      'fr=https://x.com/fr/blog',
      'x-default=https://x.com/blog',
    ])
  })

  it('strips the CURRENT locale prefix before rebuilding the others', () => {
    // Visiting the German page must still produce the English URL as
    // `/blog`, not `/de/blog` with an `en` tag on it. This is the arm
    // that goes wrong when the path is used verbatim.
    const t = buildMetaTags({
      canonical: 'https://x.com/de/blog',
      origin: 'https://x.com',
      i18n,
    })
    expect(alternates(t)).toEqual([
      'en=https://x.com/blog',
      'de=https://x.com/de/blog',
      'fr=https://x.com/fr/blog',
      'x-default=https://x.com/blog',
    ])
  })

  it('does not emit a trailing-slash variant for the ROOT path', () => {
    // `/de/` and `/de` are two URLs for one page. The `=== '/'` arm is
    // what keeps them from both appearing.
    const t = buildMetaTags({ canonical: 'https://x.com/', origin: 'https://x.com', i18n })
    expect(alternates(t)).toEqual([
      'en=https://x.com/',
      'de=https://x.com/de',
      'fr=https://x.com/fr',
      'x-default=https://x.com/',
    ])
  })

  it('prefixes EVERY locale under the `prefix` strategy', () => {
    // The other strategy — here the default locale is prefixed too, and
    // a bare path would 404.
    const t = buildMetaTags({
      canonical: 'https://x.com/en/blog',
      origin: 'https://x.com',
      i18n: { ...i18n, strategy: 'prefix' },
    })
    expect(alternates(t)).toEqual([
      'en=https://x.com/en/blog',
      'de=https://x.com/de/blog',
      'fr=https://x.com/fr/blog',
      // NOT a bare `/blog` — see the x-default spec below.
      'x-default=https://x.com/en/blog',
    ])
  })

  it('falls back to the root path when there is no canonical', () => {
    // `canonical?.replace(...) ?? '/'`. Without the fallback the path is
    // `undefined` and every href reads `https://x.comundefined`.
    const t = buildMetaTags({ origin: 'https://x.com', i18n })
    for (const a of alternates(t)) expect(a).not.toContain('undefined')
  })

  it('produces relative hrefs when no origin is configured', () => {
    // `origin ?? ''`. A site that does not know its own origin still
    // emits usable relative alternates rather than `undefinedde/blog`.
    const t = buildMetaTags({ canonical: '/blog', i18n })
    expect(alternates(t)).toEqual([
      'en=/blog',
      'de=/de/blog',
      'fr=/fr/blog',
      'x-default=/blog',
    ])
  })

  it('points x-default at the DEFAULT LOCALE URL, not at a bare path', () => {
    // `x-default` is the URL a crawler serves to a visitor whose
    // language matches no alternate, so it is the one that must resolve.
    // Under `prefix` there IS no unprefixed route — `expandRoutesForLocales`
    // emits every route under a locale segment — so a bare
    // `pathWithoutLocale` here names a URL the build never produced.
    // Deriving it from the default locale's own alternate makes the two
    // agree by construction.
    const t = buildMetaTags({
      canonical: 'https://x.com/de/blog',
      origin: 'https://x.com',
      i18n: { ...i18n, strategy: 'prefix' },
    })
    const byLang = Object.fromEntries(
      t.link.filter((l) => l.rel === 'alternate').map((l) => [l.hreflang, l.href]),
    )
    expect(byLang['x-default'], 'x-default must not 404').toBe('https://x.com/en/blog')
    expect(byLang['x-default'], 'and must equal the default locale alternate').toBe(byLang.en)
  })

  it('leaves x-default on the bare path under prefix-except-default', () => {
    // The other strategy DOES serve the default locale unprefixed, so
    // the fix above must not move this one.
    const t = buildMetaTags({ canonical: 'https://x.com/blog', origin: 'https://x.com', i18n })
    const byLang = Object.fromEntries(
      t.link.filter((l) => l.rel === 'alternate').map((l) => [l.hreflang, l.href]),
    )
    expect(byLang['x-default']).toBe('https://x.com/blog')
    expect(byLang['x-default']).toBe(byLang.en)
  })

  it('marks every OTHER locale as an og:locale:alternate, not the current one', () => {
    // Listing the current locale as its own alternate is what makes a
    // scraper report the page as duplicating itself.
    const t = buildMetaTags({ canonical: '/blog', i18n, locale: 'de' })
    expect(prop(t, 'og:locale:alternate')).toEqual(['en', 'fr'])
  })
})

describe('article metadata is emitted only for articles', () => {
  const article = {
    type: 'article' as const,
    publishedTime: '2024-01-01',
    modifiedTime: '2024-06-01',
    author: 'Ada',
    tags: ['a', 'b'],
  }

  it('emits published, modified, author and every tag', () => {
    // `modified_time` is the one search engines use to decide a page is
    // worth re-crawling; dropping it freezes the snippet.
    const t = buildMetaTags(article)
    expect(prop(t, 'article:published_time')).toEqual(['2024-01-01'])
    expect(prop(t, 'article:modified_time')).toEqual(['2024-06-01'])
    expect(prop(t, 'article:author')).toEqual(['Ada'])
    expect(prop(t, 'article:tag')).toEqual(['a', 'b'])
  })

  it('emits NONE of it for a website', () => {
    // The same props on a non-article page must not produce article
    // markup, which would misclassify the page.
    const t = buildMetaTags({ ...article, type: 'website' })
    expect(prop(t, 'article:published_time')).toEqual([])
    expect(prop(t, 'article:author')).toEqual([])
  })

  it('omits an absent modified time rather than emitting an empty one', () => {
    const t = buildMetaTags({ type: 'article', publishedTime: '2024-01-01' })
    expect(prop(t, 'article:modified_time')).toEqual([])
  })
})

describe('media tags carry the type a scraper needs', () => {
  it('auto-detects mp4 and webm from the extension', () => {
    // Without `og:video:type` most scrapers refuse to render the player
    // and fall back to a static image.
    expect(prop(buildMetaTags({ video: 'https://x.com/v.mp4' }), 'og:video:type')).toEqual([
      'video/mp4',
    ])
    expect(prop(buildMetaTags({ video: 'https://x.com/v.webm' }), 'og:video:type')).toEqual([
      'video/webm',
    ])
  })

  it('emits no type for an unrecognised extension rather than guessing', () => {
    const t = buildMetaTags({ video: 'https://x.com/v.mov' })
    expect(prop(t, 'og:video')).toEqual(['https://x.com/v.mov'])
    expect(prop(t, 'og:video:type')).toEqual([])
  })

  it('carries video dimensions and audio when given', () => {
    const t = buildMetaTags({ video: '/v.mp4', videoWidth: 640, videoHeight: 480, audio: '/a.mp3' })
    expect(prop(t, 'og:video:width')).toEqual(['640'])
    expect(prop(t, 'og:video:height')).toEqual(['480'])
    expect(prop(t, 'og:audio')).toEqual(['/a.mp3'])
  })
})

describe('robots and noIndex', () => {
  it('noIndex overrides an explicit robots value', () => {
    // The convenience prop has to WIN, or a page marked noIndex by a
    // layout is silently indexed because a route set `robots`.
    const t = buildMetaTags({ noIndex: true, robots: 'index, follow' })
    expect(named(t, 'robots')).toEqual(['noindex, nofollow'])
  })

  it('defaults to index, follow', () => {
    expect(named(buildMetaTags({}), 'robots')).toEqual(['index, follow'])
  })
})

describe('the OG image resolves from a template only when no image is given', () => {
  it('an explicit image WINS over the template, dimensions included', () => {
    // The template's 1200x630 must not be attached to someone else's
    // image — a wrong declared size distorts the card.
    const t = buildMetaTags({ image: '/mine.png', ogTemplate: 'post' })
    expect(prop(t, 'og:image')).toEqual(['/mine.png'])
    expect(prop(t, 'og:image:width')).toEqual([])
  })

  it('a template supplies both the path and the standard dimensions', () => {
    const t = buildMetaTags({ ogTemplate: 'post' })
    expect(prop(t, 'og:image').length).toBe(1)
    expect(prop(t, 'og:image:width')).toEqual(['1200'])
    expect(prop(t, 'og:image:height')).toEqual(['630'])
  })
})

describe('structured data and extras', () => {
  it('wraps jsonLd in the schema.org context', () => {
    // Without `@context` the block is not structured data at all — it is
    // an inert script tag, and rich results never appear.
    const t = buildMetaTags({ jsonLd: { '@type': 'Article', headline: 'H' } })
    const parsed = JSON.parse(String(t.script[0]!.children))
    expect(parsed['@context']).toBe('https://schema.org')
    expect(parsed['@type']).toBe('Article')
  })

  it('appends caller-supplied extra tags', () => {
    const t = buildMetaTags({ extra: [{ name: 'custom', content: 'v' }] })
    expect(named(t, 'custom')).toEqual(['v'])
  })

  it('emits explicit alternateLocales alongside i18n-generated ones', () => {
    const t = buildMetaTags({ alternateLocales: [{ locale: 'ja', url: '/ja' }] })
    expect(alternates(t)).toEqual(['ja=/ja'])
  })
})
