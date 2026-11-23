import '../ui-init'
import { h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { describe, expect, it } from 'vitest'
import { HOME, type HomeHero } from '../content/home'
import { Loop, Poster } from '../kit/media'

/**
 * A theme pair (dark and light pictures, CSS shows one) must never be
 * `loading="eager"`: an eager image downloads even while `display: none`, so
 * an eager hero pair fetched BOTH posters at high priority before the first
 * paint. Lazy + `fetchpriority="high"` loads only the shown one, as soon as
 * layout places it.
 */
const media = (HOME.sections.find((s) => s.kind === 'hero') as HomeHero).visual.media

const imgs = (html: string) => html.match(/<img\b[^>]*>/g) ?? []

describe('eager theme pairs', () => {
  for (const [name, node] of [
    ['Loop', h(Loop, { media, eager: true })],
    ['Poster', h(Poster, { file: 'home/proof-charts.svg', eager: true })],
  ] as const) {
    it(`${name}: both pictures lazy, both high priority`, async () => {
      const tags = imgs(await renderToString(node))
      expect(tags).toHaveLength(2)
      for (const tag of tags) {
        expect(tag).toContain('loading="lazy"')
        expect(tag).toContain('fetchpriority="high"')
      }
    })
  }
})
