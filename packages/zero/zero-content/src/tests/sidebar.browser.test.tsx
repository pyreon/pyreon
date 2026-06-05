/**
 * <Sidebar> browser tests — real Chromium via @vitest/browser.
 *
 * Locks in:
 *   - Grouping + ordering renders the right DOM structure
 *   - Active-link highlighting reacts to a `currentPath` signal flip
 *     (mirrors how the router signal drives it in production)
 *   - aria-current="page" is set on the active link (a11y contract)
 *   - The empty-group default bucket renders BEFORE named groups
 */
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'
import { Sidebar, type SidebarEntry } from '../components/Sidebar'

describe('<Sidebar> browser', () => {
  it('renders the default group + named groups in order', () => {
    const entries: SidebarEntry[] = [
      { title: 'Getting Started', url: '/docs/getting-started' },
      { title: 'Reactivity', url: '/docs/reactivity', group: 'Core' },
      { title: 'Compiler', url: '/docs/compiler', group: 'Core' },
      { title: 'Router', url: '/docs/router', group: 'Routing' },
    ]
    const { container, unmount } = mountInBrowser(
      <Sidebar entries={entries} currentPath={() => '/'} />,
    )
    const groups = container.querySelectorAll('.pyreon-sidebar__group')
    // Default group (no label) + Core + Routing = 3 groups
    expect(groups.length).toBe(3)
    // Named groups render alphabetically AFTER the default bucket.
    const titles = Array.from(
      container.querySelectorAll('.pyreon-sidebar__group-title'),
    ).map((n) => n.textContent)
    expect(titles).toEqual(['Core', 'Routing'])
    unmount()
  })

  it('sorts entries within a group by `order` then `title`', () => {
    const entries: SidebarEntry[] = [
      { title: 'B', url: '/b', group: 'X', order: 2 },
      { title: 'A', url: '/a', group: 'X', order: 1 },
      { title: 'C', url: '/c', group: 'X' /* no order = ∞ */ },
      { title: 'Z', url: '/z', group: 'X', order: 1 },
    ]
    const { container, unmount } = mountInBrowser(
      <Sidebar entries={entries} currentPath={() => '/'} />,
    )
    const items = Array.from(
      container.querySelectorAll('.pyreon-sidebar__link'),
    ).map((n) => n.textContent)
    // order=1 → A, Z (tie broken by title); order=2 → B; order=∞ → C
    expect(items).toEqual(['A', 'Z', 'B', 'C'])
    unmount()
  })

  it('flips aria-current + active class when currentPath changes', async () => {
    const entries: SidebarEntry[] = [
      { title: 'A', url: '/docs/a' },
      { title: 'B', url: '/docs/b' },
    ]
    const path = signal('/docs/a')
    const { container, unmount } = mountInBrowser(
      <Sidebar entries={entries} currentPath={() => path()} />,
    )

    const links = () =>
      Array.from(container.querySelectorAll('a.pyreon-sidebar__link')) as HTMLAnchorElement[]

    // Initially `/docs/a` is active.
    expect(links()[0]?.getAttribute('aria-current')).toBe('page')
    expect(links()[1]?.getAttribute('aria-current')).toBeNull()
    expect(links()[0]?.className).toContain('pyreon-sidebar__link--active')

    // Flip the signal.
    path.set('/docs/b')
    await flush()

    expect(links()[0]?.getAttribute('aria-current')).toBeNull()
    expect(links()[1]?.getAttribute('aria-current')).toBe('page')
    expect(links()[1]?.className).toContain('pyreon-sidebar__link--active')
    unmount()
  })

  it('renders the optional title above the groups', () => {
    const { container, unmount } = mountInBrowser(
      <Sidebar
        entries={[{ title: 'A', url: '/a' }]}
        currentPath={() => '/'}
        title="Docs"
      />,
    )
    const title = container.querySelector('.pyreon-sidebar__title')
    expect(title?.textContent).toBe('Docs')
    unmount()
  })

  it('uses semantic <nav> with an aria-label for screen readers', () => {
    const { container, unmount } = mountInBrowser(
      <Sidebar entries={[]} currentPath={() => '/'} />,
    )
    const nav = container.querySelector('nav.pyreon-sidebar')
    expect(nav).not.toBeNull()
    expect(nav?.getAttribute('aria-label')).toBe('Documentation sidebar')
    unmount()
  })
})
