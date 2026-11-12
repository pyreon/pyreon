import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { readPosts } from '../../../vite-plugins/blog'
import { estimateWords, plannedPosts, upNext } from '../planned'

const POSTS = resolve(__dirname, '../../content/blog')
const posts = readPosts(POSTS)
const at = (day: string) => Date.parse(day)

describe('plannedPosts', () => {
  it('before the first post, every post is planned, soonest first', () => {
    const planned = plannedPosts(posts, at('2026-11-12'))
    expect(planned).toHaveLength(readdirSync(POSTS).filter((f) => f.endsWith('.md')).length)
    expect(planned[0]?.date).toBe('2026-11-16')
    const days = planned.map((p) => p.date)
    expect([...days].sort()).toEqual(days)
  })

  it('a post leaves the plan on its date, and nothing is planned once every date has passed', () => {
    const before = plannedPosts(posts, at('2026-11-15T23:59:59Z'))
    const on = plannedPosts(posts, at('2026-11-16'))
    expect(before.length - on.length).toBe(1)
    expect(before[0]?.title).toMatch(/^Your component runs once/)
    expect(on.some((p) => p.title === before[0]?.title)).toBe(false)
    expect(plannedPosts(posts, at('2099-01-01'))).toEqual([])
  })

  it('carries only what a planned card shows: never the slug, the URL or the body', () => {
    for (const p of plannedPosts(posts, at('2026-11-12'))) {
      expect(Object.keys(p).sort()).toEqual(['date', 'description', 'readingMinutes', 'tags', 'title'])
      expect(p.title.length).toBeGreaterThan(10)
      expect(p.description.length).toBeGreaterThan(20)
      expect(p.tags.length).toBeGreaterThan(0)
      expect(p.readingMinutes).toBeGreaterThanOrEqual(1)
    }
  })

  it('never plans a draft or a post without a date', () => {
    const files = [
      { data: { title: 'Draft', description: 'd', date: '2030-01-01', draft: true }, body: 'x' },
      { data: { title: 'Undated', description: 'd' }, body: 'x' },
      { data: { title: 'Later', description: 'd', date: '2030-01-01', tags: ['a'] }, body: 'one two three' },
    ]
    expect(plannedPosts(files, at('2026-01-01')).map((p) => p.title)).toEqual(['Later'])
  })
})

describe('upNext', () => {
  it('drops a planned post whose title is already published', () => {
    const planned = plannedPosts(posts, at('2026-11-12'))
    const first = planned[0]?.title as string
    expect(upNext(planned, [first]).map((p) => p.title)).not.toContain(first)
    expect(upNext(planned, [])).toHaveLength(planned.length)
  })
})

describe('estimateWords', () => {
  it('counts prose, inline code and code blocks; not link targets, images, raw HTML or fence info', () => {
    expect(estimateWords('Hello [the docs](https://example.com/a/b) world')).toBe(4)
    expect(estimateWords('![alt text here](/x.png) one')).toBe(1)
    expect(estimateWords('<div class="x">two words</div>')).toBe(2)
    expect(estimateWords('a `<Show when>` b')).toBe(4)
    expect(estimateWords('```tsx\n<div>{count()}</div>\n```')).toBe(3)
    expect(estimateWords("don't stop")).toBe(2)
  })
})
