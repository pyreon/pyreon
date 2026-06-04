/**
 * <Toc> browser tests — real Chromium via @vitest/browser.
 *
 * Locks in:
 *   - Default level filter (2..3) skips H1 + H4+
 *   - Custom minLevel/maxLevel widens / narrows the range
 *   - External `activeSlug` accessor flips the aria-current + active
 *     class reactively (the integration shape used by the docs site
 *     when scroll-spy is driven from a router signal)
 *   - SSR-safe path: rendering still emits the heading list when
 *     IntersectionObserver is unavailable (proven via the no-activeSlug
 *     code path running without any in-DOM heading elements to track)
 */
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'
import { Toc } from '../components/Toc'
import type { Heading } from '../types'

const HEADINGS: Heading[] = [
  { level: 1, text: 'Title', slug: 'title' },
  { level: 2, text: 'Setup', slug: 'setup' },
  { level: 3, text: 'Install', slug: 'install' },
  { level: 3, text: 'Configure', slug: 'configure' },
  { level: 2, text: 'Usage', slug: 'usage' },
  { level: 4, text: 'Nested', slug: 'nested' },
]

describe('<Toc> browser', () => {
  it('renders only level 2-3 headings by default', () => {
    const { container, unmount } = mountInBrowser(<Toc headings={HEADINGS} />)
    const items = Array.from(
      container.querySelectorAll('.pyreon-toc__link'),
    ).map((n) => n.textContent)
    expect(items).toEqual(['Setup', 'Install', 'Configure', 'Usage'])
    unmount()
  })

  it('respects custom minLevel / maxLevel', () => {
    const { container, unmount } = mountInBrowser(
      <Toc headings={HEADINGS} minLevel={1} maxLevel={2} />,
    )
    const items = Array.from(
      container.querySelectorAll('.pyreon-toc__link'),
    ).map((n) => n.textContent)
    expect(items).toEqual(['Title', 'Setup', 'Usage'])
    unmount()
  })

  it('flips aria-current + active class when activeSlug accessor changes', async () => {
    const active = signal<string | null>('setup')
    const { container, unmount } = mountInBrowser(
      <Toc headings={HEADINGS} activeSlug={() => active()} />,
    )

    const linkBySlug = (slug: string) =>
      container.querySelector(`a[href="#${slug}"]`) as HTMLAnchorElement | null

    expect(linkBySlug('setup')?.getAttribute('aria-current')).toBe('location')
    expect(linkBySlug('setup')?.className).toContain('pyreon-toc__link--active')
    expect(linkBySlug('install')?.getAttribute('aria-current')).toBeNull()

    active.set('install')
    await flush()

    expect(linkBySlug('setup')?.getAttribute('aria-current')).toBeNull()
    expect(linkBySlug('install')?.getAttribute('aria-current')).toBe('location')
    expect(linkBySlug('install')?.className).toContain(
      'pyreon-toc__link--active',
    )
    unmount()
  })

  it('clears active state when activeSlug returns null', async () => {
    const active = signal<string | null>('setup')
    const { container, unmount } = mountInBrowser(
      <Toc headings={HEADINGS} activeSlug={() => active()} />,
    )
    const setup = () =>
      container.querySelector('a[href="#setup"]') as HTMLAnchorElement | null
    expect(setup()?.getAttribute('aria-current')).toBe('location')

    active.set(null)
    await flush()

    const links = Array.from(container.querySelectorAll('.pyreon-toc__link'))
    for (const link of links) {
      expect(link.getAttribute('aria-current')).toBeNull()
      expect(link.className).not.toContain('pyreon-toc__link--active')
    }
    unmount()
  })

  it('renders nothing harmful when given an empty headings list', () => {
    const { container, unmount } = mountInBrowser(<Toc headings={[]} />)
    const links = container.querySelectorAll('.pyreon-toc__link')
    expect(links.length).toBe(0)
    unmount()
  })

  it('uses the host class override', () => {
    const { container, unmount } = mountInBrowser(
      <Toc headings={HEADINGS} class="custom-toc" />,
    )
    const root = container.querySelector('aside.pyreon-toc') as HTMLElement | null
    expect(root).not.toBeNull()
    expect(root?.getAttribute('class') ?? '').toContain('custom-toc')
    unmount()
  })

  it('emits anchor hrefs to slug fragments', () => {
    const { container, unmount } = mountInBrowser(<Toc headings={HEADINGS} />)
    const hrefs = Array.from(
      container.querySelectorAll('a.pyreon-toc__link'),
    ).map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual([
      '#setup',
      '#install',
      '#configure',
      '#usage',
    ])
    unmount()
  })
})
