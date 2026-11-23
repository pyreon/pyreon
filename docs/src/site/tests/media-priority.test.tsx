import '../ui-init'
import { h } from '@pyreon/core'
import { renderWithHead } from '@pyreon/head/ssr'
import { describe, expect, it } from 'vitest'
import { PRE_PAINT_SCRIPT } from '../color-mode'
import { HOME, type HomeHero } from '../content/home'
import { pictureOf } from '../kit/assets'
import { Loop, Poster, posterPreloadScript } from '../kit/media'

/**
 * A theme pair (dark and light pictures, CSS shows one) must never be
 * `loading="eager"`: an eager image downloads even while `display: none`, so
 * an eager hero pair fetched BOTH posters at high priority before the first
 * paint, also on phones where the hero visual is not displayed at all. Both
 * pictures are lazy; an eager pair instead gets an inline script that
 * preloads the ONE poster for the theme the pre-paint script chose (stored
 * choice first, OS preference otherwise), limited to where it is displayed.
 */
const media = (HOME.sections.find((s) => s.kind === 'hero') as HomeHero).visual.media

const imgs = (html: string) => html.match(/<img\b[^>]*>/g) ?? []
const scripts = (head: string) => head.match(/<script\b[^>]*>[\s\S]*?<\/script>/g) ?? []

describe('eager theme pairs (server render)', () => {
  for (const [name, node] of [
    ['Loop', h(Loop, { media, eager: true, preloadMedia: '(min-width: 700px)' })],
    ['Poster', h(Poster, { file: 'home/proof-charts.svg', eager: true, preloadMedia: '(min-width: 700px)' })],
  ] as const) {
    it(`${name}: both pictures lazy + high priority, one preload script, no static preload`, async () => {
      const { html, head } = await renderWithHead(node)
      const tags = imgs(html)
      expect(tags).toHaveLength(2)
      for (const tag of tags) {
        expect(tag).toContain('loading="lazy"')
        expect(tag).toContain('fetchpriority="high"')
      }
      expect(head).not.toMatch(/<link\b[^>]*rel="preload"[^>]*as="image"/)
      expect(scripts(head).filter((s) => s.includes('"preload"'))).toHaveLength(1)
    })
  }

  it('a lazy (not eager) pair adds no preload', async () => {
    const { head } = await renderWithHead(h(Loop, { media }))
    expect(scripts(head).filter((s) => s.includes('"preload"'))).toHaveLength(0)
  })
})

/**
 * Run the real pre-paint script, then the preload script, against a fake
 * document with the given stored theme and OS preference. Returns the links
 * the preload script inserted.
 */
function preloadsFor(stored: string | null, prefersLight: boolean, script: string) {
  const attrs: Record<string, string> = {}
  const links: Record<string, string>[] = []
  const doc = {
    documentElement: {
      setAttribute: (k: string, v: string) => (attrs[k] = v),
      getAttribute: (k: string) => attrs[k] ?? null,
      style: {} as Record<string, string>,
    },
    createElement: () => {
      const el: Record<string, string> & { setAttribute?: (k: string, v: string) => void } = {}
      el.setAttribute = (k: string, v: string) => {
        el[k] = v
      }

      return el
    },
    head: { appendChild: (l: Record<string, string>) => links.push(l) },
  }
  const ls = { getItem: (k: string) => (k === 'pyreon-theme' ? stored : null) }
  const mm = (q: string) => ({ matches: q.includes('light') ? prefersLight : !prefersLight })
  new Function('document', 'localStorage', 'window', PRE_PAINT_SCRIPT)(doc, ls, { matchMedia: mm })
  new Function('document', script)(doc)

  return { theme: attrs['data-theme'], links }
}

describe('the preload follows the theme the visitor sees', () => {
  const dark = pictureOf(media.dark.poster)
  const light = pictureOf(media.light.poster)
  const script = posterPreloadScript(dark, light, '100vw', '(min-width: 700px)')

  const cases: [string | null, boolean, 'dark' | 'light'][] = [
    ['light', false, 'light'], // stored light, OS dark
    ['dark', true, 'dark'], // stored dark, OS light
    [null, true, 'light'], // no stored choice: the OS decides
    [null, false, 'dark'],
  ]
  it.each(cases)('stored %s, OS prefers light %s → %s poster only', (stored, prefersLight, expected) => {
    const { theme, links } = preloadsFor(stored, prefersLight, script)
    expect(theme).toBe(expected)
    expect(links).toHaveLength(1)
    const want = expected === 'light' ? light : dark
    expect(links[0]).toMatchObject({
      rel: 'preload',
      as: 'image',
      href: want.src,
      imagesrcset: want.sources[0]!.srcset,
      media: '(min-width: 700px)',
      fetchpriority: 'high',
    })
  })
})
