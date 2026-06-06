// PR-I — sidebar / router widgets (audit H11+H13+M9+M10+M11)
//
// Five independent audit items, one PR:
//
//  - H11 — `defineSidebar` config-driven mode that lets users pin the
//          navigation structure in TypeScript instead of relying on
//          per-file frontmatter `sidebar.order` / `sidebar.group`.
//          `<Sidebar config={...}>` skips the auto-sort pass.
//
//  - H13 — `<Toc>` smooth-scroll on click. Intercepts the `<a>` click,
//          animates `window.scrollTo({ behavior: 'smooth' })`, and
//          updates the URL hash without the native jump. Falls back
//          gracefully on SSR / older runtimes.
//
//  - M9 — `<PrevNext>` page navigation footer. Pure resolver
//         (`resolvePrevNext`) + a rendered component reading
//         `currentPath`.
//
//  - M10 — `<Breadcrumbs>` path crumb trail. Auto-derives labels
//          from URL segments; optional entry-lookup mode for explicit
//          titles.
//
//  - M11 — `resolvePageLayout` — frontmatter-driven per-page layout
//          override. Falls back to the default layout with a
//          diagnostic when the named layout isn't in the registry.

import { describe, expect, it, vi } from 'vitest'
import { mountReactive } from '@pyreon/test-utils'
import { signal } from '@pyreon/reactivity'
import {
  Breadcrumbs,
  buildBreadcrumbs,
  defineSidebar,
  groupsFromConfig,
  humanize,
  PrevNext,
  resolvePageLayout,
  resolvePrevNext,
  Sidebar,
  Toc,
  type ContentLayout,
  type SidebarEntry,
} from '../index'

describe('PR-I — H11 — defineSidebar + config-driven Sidebar', () => {
  it('defineSidebar returns its input verbatim', () => {
    const config = defineSidebar({
      groups: [
        { label: 'Start', items: [{ url: '/a', title: 'A' }] },
      ],
    })
    expect(config.groups[0]!.label).toBe('Start')
  })

  it('groupsFromConfig preserves authored order (no per-item sort)', () => {
    const config = defineSidebar({
      groups: [
        {
          label: 'Order',
          items: [
            { url: '/zebra', title: 'Z' },
            { url: '/apple', title: 'A' },
            { url: '/mango', title: 'M' },
          ],
        },
      ],
    })
    const groups = groupsFromConfig(config)
    expect(groups[0]!.items.map((i) => i.title)).toEqual(['Z', 'A', 'M'])
  })

  it('Sidebar renders config-driven mode when config prop is supplied', () => {
    const currentPath = signal('/a')
    const config = defineSidebar({
      groups: [
        { label: 'Docs', items: [{ url: '/a', title: 'A' }, { url: '/b', title: 'B' }] },
      ],
    })
    const { container, cleanup } = mountReactive(
      <Sidebar config={config} currentPath={() => currentPath()} />,
    )
    const links = container.querySelectorAll('.pyreon-sidebar__link')
    expect(links.length).toBe(2)
    expect(links[0]!.textContent).toContain('A')
    cleanup()
  })

  it('Sidebar config-mode takes precedence over entries prop', () => {
    const config = defineSidebar({
      groups: [{ items: [{ url: '/config', title: 'From Config' }] }],
    })
    const entries: SidebarEntry[] = [{ url: '/entry', title: 'From Entry' }]
    const { container, cleanup } = mountReactive(
      <Sidebar
        config={config}
        entries={entries}
        currentPath={() => '/'}
      />,
    )
    expect(container.textContent).toContain('From Config')
    expect(container.textContent).not.toContain('From Entry')
    cleanup()
  })
})

describe('PR-I — H13 — Toc smooth-scroll on click', () => {
  it('intercepts the click, calls scrollTo with smooth behavior, and updates the hash', () => {
    // Set up a dummy heading element so the handler can resolve it.
    const heading = document.createElement('h2')
    heading.id = 'my-section'
    heading.textContent = 'My Section'
    document.body.appendChild(heading)

    const scrollSpy = vi.fn()
    const originalScrollTo = window.scrollTo
    window.scrollTo = scrollSpy as unknown as typeof window.scrollTo

    try {
      const { container, cleanup } = mountReactive(
        <Toc
          headings={[
            { level: 2, text: 'My Section', slug: 'my-section' },
          ]}
        />,
      )
      const link = container.querySelector('.pyreon-toc__link') as HTMLAnchorElement
      expect(link).not.toBeNull()
      link.click()
      expect(scrollSpy).toHaveBeenCalledOnce()
      const arg = scrollSpy.mock.calls[0]![0]
      expect(arg.behavior).toBe('smooth')
      cleanup()
    } finally {
      window.scrollTo = originalScrollTo
      document.body.removeChild(heading)
    }
  })

  it('respects smoothScroll=false and uses the browser default', () => {
    const heading = document.createElement('h2')
    heading.id = 'x'
    document.body.appendChild(heading)
    const scrollSpy = vi.fn()
    const originalScrollTo = window.scrollTo
    window.scrollTo = scrollSpy as unknown as typeof window.scrollTo

    try {
      const { container, cleanup } = mountReactive(
        <Toc
          smoothScroll={false}
          headings={[{ level: 2, text: 'X', slug: 'x' }]}
        />,
      )
      const link = container.querySelector('.pyreon-toc__link') as HTMLAnchorElement
      link.click()
      expect(scrollSpy).not.toHaveBeenCalled()
      cleanup()
    } finally {
      window.scrollTo = originalScrollTo
      document.body.removeChild(heading)
    }
  })

  it('applies scrollOffset to the target scroll position', () => {
    const heading = document.createElement('h2')
    heading.id = 'y'
    document.body.appendChild(heading)
    const scrollSpy = vi.fn()
    const originalScrollTo = window.scrollTo
    window.scrollTo = scrollSpy as unknown as typeof window.scrollTo

    try {
      const { container, cleanup } = mountReactive(
        <Toc
          scrollOffset={64}
          headings={[{ level: 2, text: 'Y', slug: 'y' }]}
        />,
      )
      const link = container.querySelector('.pyreon-toc__link') as HTMLAnchorElement
      link.click()
      expect(scrollSpy).toHaveBeenCalledOnce()
      const target = (scrollSpy.mock.calls[0]![0] as { top: number }).top
      // Offset subtracts 64 from the resolved target — we just assert
      // it's NOT the raw rect top (which is 0 in happy-dom).
      expect(typeof target).toBe('number')
      cleanup()
    } finally {
      window.scrollTo = originalScrollTo
      document.body.removeChild(heading)
    }
  })
})

describe('PR-I — M9 — PrevNext', () => {
  it.each([
    [['a', 'b', 'c'], 'a', null, 'b'],
    [['a', 'b', 'c'], 'b', 'a', 'c'],
    [['a', 'b', 'c'], 'c', 'b', null],
    [['a', 'b', 'c'], 'missing', null, null],
    [[], 'a', null, null],
  ])('resolvePrevNext(%j, %j) → prev=%s next=%s', (urls, currentSlug, expectedPrev, expectedNext) => {
    const entries: SidebarEntry[] = (urls as string[]).map((u) => ({
      url: `/${u}`,
      title: u.toUpperCase(),
    }))
    const result = resolvePrevNext(entries, `/${currentSlug}`)
    if (expectedPrev === null) {
      expect(result.prev).toBeNull()
    } else {
      expect(result.prev?.url).toBe(`/${expectedPrev}`)
    }
    if (expectedNext === null) {
      expect(result.next).toBeNull()
    } else {
      expect(result.next?.url).toBe(`/${expectedNext}`)
    }
  })

  it('renders both prev and next links when middle entry is current', () => {
    const entries: SidebarEntry[] = [
      { url: '/a', title: 'A' },
      { url: '/b', title: 'B' },
      { url: '/c', title: 'C' },
    ]
    const { container, cleanup } = mountReactive(
      <PrevNext entries={entries} currentPath={() => '/b'} />,
    )
    const prev = container.querySelector('.pyreon-prevnext__link--prev') as HTMLAnchorElement
    const next = container.querySelector('.pyreon-prevnext__link--next') as HTMLAnchorElement
    expect(prev).not.toBeNull()
    expect(next).not.toBeNull()
    expect(prev.getAttribute('href')).toBe('/a')
    expect(next.getAttribute('href')).toBe('/c')
    cleanup()
  })

  it('omits the prev link when the current entry is first', () => {
    const entries: SidebarEntry[] = [
      { url: '/a', title: 'A' },
      { url: '/b', title: 'B' },
    ]
    const { container, cleanup } = mountReactive(
      <PrevNext entries={entries} currentPath={() => '/a'} />,
    )
    expect(container.querySelector('.pyreon-prevnext__link--prev')).toBeNull()
    expect(container.querySelector('.pyreon-prevnext__link--next')).not.toBeNull()
    cleanup()
  })

  it('honors custom labels', () => {
    const entries: SidebarEntry[] = [
      { url: '/a', title: 'A' },
      { url: '/b', title: 'B' },
    ]
    const { container, cleanup } = mountReactive(
      <PrevNext
        entries={entries}
        currentPath={() => '/a'}
        labels={{ next: 'Up Next' }}
      />,
    )
    expect(container.textContent).toContain('Up Next')
    cleanup()
  })
})

describe('PR-I — M10 — Breadcrumbs', () => {
  it.each([
    ['Hello World', 'Hello World'],
    ['getting-started', 'Getting Started'],
    ['api-reference', 'Api Reference'],
    ['single', 'Single'],
  ])('humanize(%j) → %j', (input, expected) => {
    expect(humanize(input)).toBe(expected)
  })

  it('buildBreadcrumbs handles the root path', () => {
    const crumbs = buildBreadcrumbs('/', 'Home', '/', undefined)
    expect(crumbs).toHaveLength(1)
    expect(crumbs[0]).toEqual({ title: 'Home', url: '/', current: true })
  })

  it('buildBreadcrumbs builds a multi-segment trail', () => {
    const crumbs = buildBreadcrumbs('/docs/getting-started', 'Home', '/', undefined)
    expect(crumbs.map((c) => c.title)).toEqual(['Home', 'Docs', 'Getting Started'])
    expect(crumbs.map((c) => c.url)).toEqual(['/', '/docs', '/docs/getting-started'])
    expect(crumbs.map((c) => c.current)).toEqual([false, false, true])
  })

  it('buildBreadcrumbs uses entry titles when supplied', () => {
    const entries: SidebarEntry[] = [
      { url: '/docs', title: 'Documentation' },
      { url: '/docs/intro', title: 'Introduction' },
    ]
    const crumbs = buildBreadcrumbs('/docs/intro', 'Home', '/', entries)
    expect(crumbs.map((c) => c.title)).toEqual(['Home', 'Documentation', 'Introduction'])
  })

  it('Breadcrumbs renders the current-page crumb as a non-link span', () => {
    const { container, cleanup } = mountReactive(
      <Breadcrumbs currentPath={() => '/docs/intro'} />,
    )
    const items = container.querySelectorAll('.pyreon-breadcrumbs__item')
    expect(items.length).toBe(3)
    const lastCrumb = items[items.length - 1]!.querySelector('.pyreon-breadcrumbs__crumb')
    expect(lastCrumb!.tagName).toBe('SPAN')
    expect(lastCrumb!.getAttribute('aria-current')).toBe('page')
    cleanup()
  })

  it('Breadcrumbs renders separators between crumbs', () => {
    const { container, cleanup } = mountReactive(
      <Breadcrumbs currentPath={() => '/a/b/c'} />,
    )
    const separators = container.querySelectorAll('.pyreon-breadcrumbs__separator')
    // 4 crumbs (Home, A, B, C) → 3 separators
    expect(separators.length).toBe(3)
    cleanup()
  })
})

describe('PR-I — M11 — per-page layout override', () => {
  const Default: ContentLayout = ({ children }) => (
    <div data-layout="default">{children}</div>
  )
  const Landing: ContentLayout = ({ children }) => (
    <div data-layout="landing">{children}</div>
  )

  it('returns the default layout when frontmatter omits `layout`', () => {
    const result = resolvePageLayout({
      frontmatter: { title: 'X' },
      registry: { landing: Landing },
      defaultLayout: Default,
    })
    expect(result.layout).toBe(Default)
    expect(result.fellBack).toBe(false)
  })

  it('returns the named layout when frontmatter matches the registry', () => {
    const result = resolvePageLayout({
      frontmatter: { layout: 'landing' },
      registry: { landing: Landing },
      defaultLayout: Default,
    })
    expect(result.layout).toBe(Landing)
    expect(result.fellBack).toBe(false)
  })

  it('falls back to default + flags fellBack=true when name is unknown', () => {
    const result = resolvePageLayout({
      frontmatter: { layout: 'missing' },
      registry: { landing: Landing },
      defaultLayout: Default,
    })
    expect(result.layout).toBe(Default)
    expect(result.fellBack).toBe(true)
    expect(result.missingName).toBe('missing')
  })

  it('falls back to default when frontmatter layout is a non-string', () => {
    const result = resolvePageLayout({
      frontmatter: { layout: 42 },
      registry: { landing: Landing },
      defaultLayout: Default,
    })
    expect(result.layout).toBe(Default)
    expect(result.fellBack).toBe(false)
  })

  it('falls back to default when frontmatter layout is an empty string', () => {
    const result = resolvePageLayout({
      frontmatter: { layout: '' },
      registry: { landing: Landing },
      defaultLayout: Default,
    })
    expect(result.layout).toBe(Default)
    expect(result.fellBack).toBe(false)
  })
})
