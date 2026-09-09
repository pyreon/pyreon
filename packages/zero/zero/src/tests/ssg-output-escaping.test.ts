import { describe, expect, it } from 'vitest'

import { generateRssFeed } from '../seo-rss'
import { generateSitemap } from '../seo'
import { renderNetlifyRedirects } from '../ssg-plugin'

const LF = String.fromCharCode(10)

/**
 * Four output surfaces that interpolate data into a format with its own
 * grammar. Each was the only unguarded field among guarded siblings, which is
 * the shape worth naming: an escaper applied to a value's neighbours and not
 * to the value itself reads as covered.
 */
describe('_redirects is line-oriented, so a value cannot contain a line', () => {
  it('a redirect target cannot inject a rule', () => {
    // `to` is the argument to a `redirect()` thrown from a route loader at
    // build time. The idiomatic CMS shape is
    // `if (post.redirectTo) throw redirect(post.redirectTo, 301)`.
    const out = renderNetlifyRedirects([
      { from: '/a', to: `/b${LF}/* https://evil.com/:splat 302${LF}#`, status: 301 } as never,
    ])
    const rules = out.split(LF).filter((l) => l !== '' && !l.startsWith('#'))
    expect(rules, 'one entry must produce exactly one rule').toHaveLength(1)
    expect(out).not.toContain('evil.com/:splat 302' + LF)
    expect(rules[0]).toBe('/a /b/* https://evil.com/:splat 302# 301')
  })

  it('a redirect SOURCE cannot inject either', () => {
    const out = renderNetlifyRedirects([
      { from: `/a${LF}/* https://evil.com 302`, to: '/b', status: 301 } as never,
    ])
    expect(out.split(LF).filter((l) => l !== '' && !l.startsWith('#'))).toHaveLength(1)
  })

  it('an ordinary redirect is unchanged', () => {
    expect(renderNetlifyRedirects([{ from: '/a', to: '/b', status: 301 } as never])).toContain(
      '/a /b 301',
    )
  })
})

describe('RSS escapes its dates, including the unparseable fall-through', () => {
  // `toRfc822` returns its INPUT VERBATIM when `new Date()` yields NaN, and the
  // result was the one RSS field that skipped the escaper. A malformed date in
  // one CMS entry is ordinary, and the fallback is exactly the branch it takes.
  const breakout = `</pubDate></item></channel></rss><!--`

  it('an unparseable pubDate cannot close the feed', () => {
    const xml = generateRssFeed({
      title: 'T',
      origin: 'https://x.test',
      items: [{ title: 'a', link: 'https://x.test/a', pubDate: breakout }],
    } as never)
    expect(xml).not.toContain('</item></channel></rss><!--')
    expect(xml.match(/<\/rss>/g) ?? [], 'the feed must close exactly once').toHaveLength(1)
  })

  it('a valid pubDate still renders as RFC 822', () => {
    const xml = generateRssFeed({
      title: 'T',
      origin: 'https://x.test',
      items: [{ title: 'a', link: 'https://x.test/a', pubDate: '2026-01-02T03:04:05Z' }],
    } as never)
    expect(xml).toMatch(/<pubDate>[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4}/)
  })
})

describe('sitemap escapes lastmod, not just loc', () => {
  it('a data-derived lastmod cannot forge a url entry', () => {
    const xml = generateSitemap([], {
      origin: 'https://x.test',
      additionalPaths: [
        { path: '/a', lastmod: '2026-01-01</lastmod></url><url><loc>https://evil.com/</loc><lastmod>x' },
      ],
    } as never)
    // The URL survives as inert TEXT — that is what escaping means, and
    // asserting its absence would be asserting the wrong thing. The invariant
    // is that no forged ELEMENT appears: one path, one <url>, one <loc>.
    expect(xml).not.toContain('<loc>https://evil.com/</loc>')
    expect(xml.match(/<url>/g) ?? [], 'one path must produce one <url>').toHaveLength(1)
    expect(xml.match(/<loc>/g) ?? [], 'and one <loc>').toHaveLength(1)
    expect(xml, 'the payload is escaped, not dropped').toContain('&lt;/lastmod&gt;')
  })

  it('an ordinary lastmod still renders', () => {
    const xml = generateSitemap([], {
      origin: 'https://x.test',
      additionalPaths: [{ path: '/a', lastmod: '2026-01-01' }],
    } as never)
    expect(xml).toContain('<lastmod>2026-01-01</lastmod>')
  })
})
