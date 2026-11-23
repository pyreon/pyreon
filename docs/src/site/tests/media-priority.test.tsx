import '../ui-init'
import { h } from '@pyreon/core'
import { renderWithHead } from '@pyreon/head/ssr'
import { describe, expect, it } from 'vitest'
import { HOME, type HomeHero } from '../content/home'
import { Loop, Poster } from '../kit/media'

/**
 * A theme pair (dark and light pictures, CSS shows one) must never be
 * `loading="eager"`: an eager image downloads even while `display: none`, so
 * an eager hero pair fetched BOTH posters at high priority before the first
 * paint, also on phones where the hero visual is not displayed at all. Both
 * pictures are lazy; an eager pair instead gets one preload per color scheme,
 * limited to where it is displayed, so the shown file is still discoverable by
 * the preload scanner (desktop LCP is this poster).
 */
const media = (HOME.sections.find((s) => s.kind === 'hero') as HomeHero).visual.media

const imgs = (html: string) => html.match(/<img\b[^>]*>/g) ?? []
const preloads = (head: string) => head.match(/<link\b[^>]*rel="preload"[^>]*as="image"[^>]*>/g) ?? []

describe('eager theme pairs', () => {
  for (const [name, node] of [
    ['Loop', h(Loop, { media, eager: true, preloadMedia: '(min-width: 700px)' })],
    ['Poster', h(Poster, { file: 'home/proof-charts.svg', eager: true, preloadMedia: '(min-width: 700px)' })],
  ] as const) {
    it(`${name}: both pictures lazy + high priority, one preload per color scheme`, async () => {
      const { html, head } = await renderWithHead(node)
      const tags = imgs(html)
      expect(tags).toHaveLength(2)
      for (const tag of tags) {
        expect(tag).toContain('loading="lazy"')
        expect(tag).toContain('fetchpriority="high"')
      }
      const links = preloads(head)
      expect(links).toHaveLength(2)
      expect(links.some((l) => l.includes('media="(min-width: 700px) and (prefers-color-scheme: dark)"'))).toBe(true)
      expect(links.some((l) => l.includes('media="(min-width: 700px) and (prefers-color-scheme: light)"'))).toBe(true)
    })
  }

  it('a lazy (not eager) pair adds no preload', async () => {
    const { head } = await renderWithHead(h(Loop, { media }))
    expect(preloads(head)).toHaveLength(0)
  })
})
