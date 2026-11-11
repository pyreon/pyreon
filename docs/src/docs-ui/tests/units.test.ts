import { describe, expect, it } from 'vitest'
import type { Benchmarks } from '../../site/content/model'
import { aiPrompt, assistantLinks, editUrlOf, rawUrlOf } from '../actions'
import { docsHead, shareCardOf, type DocsShareCards } from '../head'
import { benchHeadline } from '../sell/headline'
import { tocEntries } from '../toc'
import { packageStatusLabel } from '../../mdx/PackageBadge'

const row = (verdict: Benchmarks['rows'][number]['verdict'], unit: Benchmarks['rows'][number]['unit'] = 'µs', pyreon: number | null = 1, rival: number | null = 2) =>
  ({ op: `${verdict}-${Math.random()}`, pyreon, rival, unit, verdict, label: '' })
const bench = (rows: Benchmarks['rows']): Benchmarks => ({ rival: '', run: '', h: '', p: '', rows })

describe('benchHeadline', () => {
  it('counts timed wins over timed rows only', () => {
    expect(benchHeadline(bench([row('win'), row('win'), row('win', 'x', null, null), row('info', ''), row('loss', 'MB')]))).toBe('2/2')
  })
  it('keeps ties and losses in the denominator', () => {
    expect(benchHeadline(bench([row('win'), row('tie', 'ms'), row('loss', 'ns')]))).toBe('1/3')
  })
  it('falls back to verdict rows when nothing is timed, and to nothing when no verdict', () => {
    expect(benchHeadline(bench([row('win', 'x'), row('split', 'KB')]))).toBe('1/2')
    expect(benchHeadline(bench([row('info', '')]))).toBeUndefined()
  })
})

describe('reader tools', () => {
  it('points the AI prompt at llms.txt and this page, and sends nothing itself', () => {
    const p = aiPrompt({ title: 'Form', url: 'https://pyreon.dev/docs/form', raw: rawUrlOf('form') })
    expect(p).toContain('https://pyreon.dev/llms.txt')
    expect(p).toContain('https://pyreon.dev/docs/form')
    expect(p).toContain('raw.githubusercontent.com/pyreon/pyreon/main/docs/src/content/docs/form.md')
    for (const l of assistantLinks(p)) expect(decodeURIComponent(l.href)).toContain('llms.txt')
  })
  it('edits the page’s own source on GitHub', () => {
    expect(editUrlOf('guides/forms')).toBe('https://github.com/pyreon/pyreon/edit/main/docs/src/content/docs/guides/forms.md')
  })
})

describe('docs head', () => {
  const cards: DocsShareCards = {
    pages: { '/docs': { image: '/a/docs.png', alt: 'docs' }, '/docs/form': { image: '/a/form.png', alt: 'form' } },
    groups: { Guides: { image: '/a/guides.png', alt: 'guides' } },
  }
  it('uses the page card, else its group card, else the docs card', () => {
    expect(shareCardOf('/docs/form', cards)?.image).toBe('/a/form.png')
    expect(shareCardOf('/docs/guides/testing', cards)?.image).toBe('/a/guides.png')
    expect(shareCardOf('/docs/zero', cards)?.image).toBe('/a/docs.png')
  })
  it('sets title, canonical, Open Graph and Twitter tags', () => {
    const h = docsHead({ path: '/docs/form/', title: 'Form', description: 'd' }, cards)
    expect(h.title).toBe('Form · Pyreon docs')
    expect(h.link).toEqual([{ rel: 'canonical', href: 'https://pyreon.dev/docs/form' }])
    const meta = Object.fromEntries((h.meta ?? []).map((m) => [('property' in m ? m.property : m.name) as string, m.content]))
    expect(meta['og:image']).toBe('https://pyreon.dev/a/form.png')
    expect(meta['twitter:card']).toBe('summary_large_image')
    expect(meta['og:url']).toBe('https://pyreon.dev/docs/form')
  })
})

describe('TOC entries', () => {
  const h = (level: number, slug: string) => ({ level, text: slug, slug })
  it('lists h2s, and h3s too when a page has fewer than three h2s', () => {
    expect(tocEntries([h(2, 'a'), h(3, 'b'), h(2, 'c'), h(2, 'd')]).map((x) => x.slug)).toEqual(['a', 'c', 'd'])
    expect(tocEntries([h(2, 'a'), h(3, 'b')]).map((x) => x.slug)).toEqual(['a', 'b'])
  })
})

describe('PackageBadge status labels (facts.md: never "stable")', () => {
  it('maps the old vocabulary', () => {
    expect(packageStatusLabel('stable')).toBe('pre-1.0')
    expect(packageStatusLabel(undefined)).toBe('pre-1.0')
    expect(packageStatusLabel('beta')).toBe('pre-1.0')
    expect(packageStatusLabel('alpha')).toBe('experimental')
    expect(packageStatusLabel('deprecated')).toBe('deprecated')
  })
})
