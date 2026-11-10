import { describe, expect, it } from 'vitest'
import {
  adjacentPosts,
  countTags,
  formatPostDate,
  isoDay,
  paginate,
  postsWithTag,
  readingMinutes,
  relatedPosts,
  slugifyTag,
  sortNewestFirst,
  toBlogPost,
  toDate,
} from '../blog/posts'
import type { BlogPost, BlogPostContext } from '../blog/posts'
import type { CollectionEntry } from '../types'

const ctx: BlogPostContext = {
  basePath: '/blog',
  authors: { ada: { name: 'Ada Lovelace', url: 'https://ada.example' } },
  defaultAuthors: [{ name: 'The Team' }],
  wordsPerMinute: 200,
}

function entry(slug: string, data: Record<string, unknown>, wordCount = 400): CollectionEntry {
  return { slug, data, wordCount, headings: [], render: async () => () => null }
}

function post(slug: string, date: string, tags: string[] = []): BlogPost {
  return toBlogPost(entry(slug, { title: slug, description: `${slug} d`, date, tags }), ctx)
}

describe('toBlogPost', () => {
  it('normalises the frontmatter a compiled module carries', () => {
    const p = toBlogPost(
      entry('hello', {
        title: 'Hello',
        description: 'Desc',
        date: '2026-11-16T00:00:00.000Z',
        updated: '2026-11-20',
        tags: ['Web Dev', 'signals', 'web-dev'],
        cover: '/c.png',
        coverAlt: 'A cover',
        author: ['ada', 'Grace Hopper'],
        canonical: 'https://elsewhere.example/hello',
      }, 1000),
      ctx,
    )
    expect(p.url).toBe('/blog/hello')
    expect(p.date.toISOString()).toBe('2026-11-16T00:00:00.000Z')
    expect(p.updated?.toISOString()).toBe('2026-11-20T00:00:00.000Z')
    // Same slug twice → one tag, first spelling kept.
    expect(p.tags).toEqual([
      { name: 'Web Dev', slug: 'web-dev', url: '/blog/tags/web-dev' },
      { name: 'signals', slug: 'signals', url: '/blog/tags/signals' },
    ])
    expect(p.cover).toEqual({ src: '/c.png', alt: 'A cover' })
    expect(p.authors).toEqual([{ name: 'Ada Lovelace', url: 'https://ada.example' }, { name: 'Grace Hopper' }])
    expect(p.canonical).toBe('https://elsewhere.example/hello')
    expect(p.wordCount).toBe(1000)
    expect(p.readingMinutes).toBe(5)
  })

  it('falls back to the default authors, no cover and no tags', () => {
    const p = toBlogPost(entry('bare', { title: 'Bare', description: 'd', date: new Date('2026-01-02') }), ctx)
    expect(p.authors).toEqual([{ name: 'The Team' }])
    expect(p.cover).toBeUndefined()
    expect(p.tags).toEqual([])
    expect(p.updated).toBeUndefined()
  })

  it('a cover without coverAlt is decorative (empty alt)', () => {
    const p = toBlogPost(entry('c', { title: 'C', description: 'd', date: '2026-01-02', cover: '/x.png' }), ctx)
    expect(p.cover).toEqual({ src: '/x.png', alt: '' })
  })
})

describe('readingMinutes', () => {
  it('rounds to whole minutes and never reports zero', () => {
    expect(readingMinutes(0)).toBe(1)
    expect(readingMinutes(100)).toBe(1)
    expect(readingMinutes(230)).toBe(1)
    expect(readingMinutes(1150)).toBe(5)
    expect(readingMinutes(1000, 200)).toBe(5)
  })
})

describe('slugifyTag', () => {
  it('lowercases, strips accents and hyphenates', () => {
    expect(slugifyTag('Web Dev')).toBe('web-dev')
    expect(slugifyTag('  Café  Crème ')).toBe('cafe-creme')
    expect(slugifyTag('server/side')).toBe('server-side')
  })
  it('keeps C, C++ and C# apart', () => {
    expect(new Set([slugifyTag('C'), slugifyTag('C++'), slugifyTag('C#')]).size).toBe(3)
  })
  it('never returns an empty segment', () => {
    expect(slugifyTag('日本')).not.toBe('')
  })
})

describe('toDate', () => {
  it('reads Dates and ISO strings, rejects the rest', () => {
    expect(toDate(new Date('2026-01-01'))?.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(toDate('2026-01-01')?.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(toDate('nope')).toBeUndefined()
    expect(toDate(new Date('nope'))).toBeUndefined()
    expect(toDate(42)).toBeUndefined()
  })
})

describe('sortNewestFirst', () => {
  it('orders by date, newest first, and by slug on the same day', () => {
    const sorted = sortNewestFirst([
      post('b', '2026-01-01'),
      post('c', '2026-03-01'),
      post('a', '2026-01-01'),
    ])
    expect(sorted.map((p) => p.slug)).toEqual(['c', 'a', 'b'])
  })
})

describe('postsWithTag + countTags', () => {
  const posts = sortNewestFirst([
    post('one', '2026-03-01', ['Signals', 'compiler']),
    post('two', '2026-02-01', ['signals']),
    post('three', '2026-01-01', ['ssr', 'compiler', 'signals']),
  ])

  it('filters by tag slug', () => {
    expect(postsWithTag(posts, 'compiler').map((p) => p.slug)).toEqual(['one', 'three'])
    expect(postsWithTag(posts, 'missing')).toEqual([])
  })

  it('counts every tag, most used first, then by name', () => {
    expect(countTags(posts).map((t) => [t.name, t.count])).toEqual([
      ['Signals', 3],
      ['compiler', 2],
      ['ssr', 1],
    ])
    expect(countTags(posts)[0]?.url).toBe('/blog/tags/signals')
  })
})

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, i) => i)

  it('slices pages and reports the page count', () => {
    expect(paginate(items, 1, 10)).toEqual({ items: items.slice(0, 10), page: 1, pageCount: 3, total: 25 })
    expect(paginate(items, 3, 10)?.items).toEqual([20, 21, 22, 23, 24])
  })

  it('returns undefined outside 1..pageCount', () => {
    expect(paginate(items, 0, 10)).toBeUndefined()
    expect(paginate(items, 4, 10)).toBeUndefined()
    expect(paginate(items, 1.5, 10)).toBeUndefined()
    expect(paginate(items, Number.NaN, 10)).toBeUndefined()
  })

  it('page 1 of an empty list is an empty page', () => {
    expect(paginate([], 1, 10)).toEqual({ items: [], page: 1, pageCount: 1, total: 0 })
    expect(paginate([], 2, 10)).toBeUndefined()
  })

  it('refuses a page size below 1', () => {
    expect(() => paginate(items, 1, 0)).toThrow(/pageSize/)
  })
})

describe('adjacentPosts', () => {
  const posts = sortNewestFirst([post('new', '2026-03-01'), post('mid', '2026-02-01'), post('old', '2026-01-01')])

  it('previous is older, next is newer', () => {
    const mid = adjacentPosts(posts, 'mid')
    expect(mid.previous?.slug).toBe('old')
    expect(mid.next?.slug).toBe('new')
    expect(adjacentPosts(posts, 'new').next).toBeUndefined()
    expect(adjacentPosts(posts, 'old').previous).toBeUndefined()
  })

  it('a post outside the list has no neighbours', () => {
    expect(adjacentPosts(posts, 'draft')).toEqual({ previous: undefined, next: undefined })
  })
})

describe('relatedPosts', () => {
  const posts = sortNewestFirst([
    post('target', '2026-03-01', ['a', 'b', 'c']),
    post('two-shared-old', '2026-01-01', ['a', 'b']),
    post('two-shared-new', '2026-02-01', ['b', 'c']),
    post('one-shared', '2026-02-15', ['c']),
    post('unrelated', '2026-02-20', ['z']),
  ])
  const target = posts.find((p) => p.slug === 'target') as BlogPost

  it('ranks by shared tags, then recency, and excludes the post itself', () => {
    expect(relatedPosts(posts, target, 3).map((p) => p.slug)).toEqual([
      'two-shared-new',
      'two-shared-old',
      'one-shared',
    ])
  })

  it('never lists posts that share no tag, and respects the limit', () => {
    expect(relatedPosts(posts, target, 10).map((p) => p.slug)).not.toContain('unrelated')
    expect(relatedPosts(posts, target, 1)).toHaveLength(1)
    expect(relatedPosts(posts, target, 0)).toEqual([])
    expect(relatedPosts(posts, post('untagged', '2026-01-01'))).toEqual([])
  })
})

describe('dates', () => {
  it('prints the UTC calendar day whatever the time zone', () => {
    const d = new Date('2026-11-16T00:00:00Z')
    expect(isoDay(d)).toBe('2026-11-16')
    expect(formatPostDate(d)).toBe('November 16, 2026')
    expect(formatPostDate(d, 'en-GB')).toBe('16 November 2026')
  })
})
