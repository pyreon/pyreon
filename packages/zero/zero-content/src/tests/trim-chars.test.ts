import { describe, expect, it } from 'vitest'
import { trimChars, trimEndChars, trimStartChars } from '../_shared/trim-chars'
import { shareTargets } from '../blog/components'
import { resolveBlogConfig } from '../blog/define-blog'
import { slugifyTag } from '../blog/posts'
import { absoluteUrl } from '../blog/seo'

// These helpers replace `/\/+$/`-style regexes that backtrack quadratically on
// a long run of the trimmed character followed by anything else (CodeQL
// js/polynomial-redos). The parity corpus pins the old regex behaviour; the
// call-count test pins linearity without a wall-clock threshold.

const corpus = ['', '/', '//', 'a', '/a', 'a/', '/a/', '//a//b//', 'a/b', '///x', `${'/'.repeat(500)}x`]

describe('trimChars', () => {
  it('matches the regex forms it replaces', () => {
    for (const s of corpus) {
      expect(trimEndChars(s, '/')).toBe(s.replace(/\/+$/, ''))
      expect(trimStartChars(s, '/')).toBe(s.replace(/^\/+/, ''))
      expect(trimChars(s, '/')).toBe(s.replace(/^\/+|\/+$/g, ''))
    }
  })

  it('accepts a character set or a predicate', () => {
    expect(trimChars('-+a-b+-', '-+')).toBe('a-b')
    expect(trimEndChars('end, . \t', (ch) => /[\s,.]/.test(ch))).toBe('end')
  })

  it('returns the same string when nothing is trimmed', () => {
    const s = 'unchanged'
    expect(trimChars(s, '/')).toBe(s)
  })

  it('tests each character at most once from each end (linear, no backtracking)', () => {
    const n = 10_000
    const input = `${'/'.repeat(n)}x${'/'.repeat(n)}`
    let calls = 0
    const isSlash = (ch: string): boolean => {
      calls++
      return ch === '/'
    }
    expect(trimChars(input, isSlash)).toBe('x')
    // n leading hits + the stop at `x`, then n trailing hits + the stop at `x`.
    expect(calls).toBe(2 * n + 2)
  })
})

describe('blog call sites keep their behaviour on long separator runs', () => {
  const run = '/'.repeat(20_000)

  it('absoluteUrl joins with exactly one slash', () => {
    expect(absoluteUrl(`https://example.com${run}`, `${run}post`)).toBe('https://example.com/post')
  })

  it('resolveBlogConfig trims basePath and siteUrl', () => {
    const resolved = resolveBlogConfig({
      siteUrl: `https://example.com${run}`,
      title: 'Blog',
      description: 'd',
      basePath: `${run}news${run}`,
    })
    expect(resolved.siteUrl).toBe('https://example.com')
    expect(resolved.basePath).toBe('/news')
  })

  it('shareTargets strips the scheme and trailing slashes of the Mastodon host', () => {
    const mastodon = shareTargets('https://example.com/p', 'T', `https://fosstodon.org${run}`).find(
      (t) => t.network === 'mastodon',
    )
    expect(mastodon?.href.startsWith('https://fosstodon.org/share?')).toBe(true)
  })

  it('slugifyTag drops leading and trailing hyphen runs', () => {
    expect(slugifyTag(`${'-'.repeat(20_000)}Web Dev${'-'.repeat(20_000)}`)).toBe('web-dev')
    expect(slugifyTag('--C++--')).toBe('c-plus-plus')
  })
})
