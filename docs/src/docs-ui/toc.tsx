export interface TocHeading {
  level: number
  text: string
  slug: string
}

/**
 * The headings the TOC lists: the page's h2s, plus its h3s when it has fewer
 * than three h2s (a short page with sub-sections still gets a useful list).
 * Pure; exported for tests.
 */
export function tocEntries(headings: readonly TocHeading[]): TocHeading[] {
  const h2 = headings.filter((h) => h.level === 2)
  if (h2.length >= 3) return h2
  return headings.filter((h) => h.level === 2 || h.level === 3)
}

/**
 * The slug of the section being read: the last heading whose top has passed
 * the line under the fixed nav (the first one before any has). Pure over the
 * headings' tops; exported for tests.
 */
export function activeSlug(tops: readonly { id: string; top: number }[], offset: number): string | undefined {
  let current = tops[0]?.id
  for (const t of tops) {
    if (t.top - offset <= 1) current = t.id
    else break
  }
  return current
}

/**
 * Scroll-spy over the static TOCs (`docs-ui/enhance.tsx` starts it): marks
 * the link of the section being read with `aria-current="location"` in both
 * TOCs (the rail's and the inline one; the layout shows one). An
 * IntersectionObserver wakes it, plus a passive scroll listener; positions
 * are re-read on every wake so late layout (images, demos) never leaves it
 * stale. Returns the cleanup.
 */
export function startScrollSpy(root: ParentNode, offset = 96): () => void {
  const links = [...root.querySelectorAll<HTMLAnchorElement>('.dx-toc__link')]
  const slugs = [...new Set(links.map((a) => decodeURIComponent(a.hash.slice(1))))]
  const els = slugs.map((s) => document.getElementById(s)).filter((e): e is HTMLElement => e !== null)
  if (els.length === 0 || typeof IntersectionObserver === 'undefined') return () => {}
  let raf = 0
  let shown: string | undefined
  const pick = () => {
    raf = 0
    const current = activeSlug(
      els.map((el) => ({ id: el.id, top: el.getBoundingClientRect().top })),
      offset,
    )
    if (current === shown) return
    shown = current
    for (const a of links) {
      if (decodeURIComponent(a.hash.slice(1)) === current) a.setAttribute('aria-current', 'location')
      else a.removeAttribute('aria-current')
    }
  }
  const schedule = () => {
    if (raf === 0) raf = requestAnimationFrame(pick)
  }
  const io = new IntersectionObserver(schedule, { rootMargin: `-${offset}px 0px -60% 0px`, threshold: [0, 1] })
  for (const el of els) io.observe(el)
  window.addEventListener('scroll', schedule, { passive: true })
  pick()
  return () => {
    if (raf !== 0) cancelAnimationFrame(raf)
    io.disconnect()
    window.removeEventListener('scroll', schedule)
  }
}

function TocList(props: { entries: readonly TocHeading[] }) {
  return (
    <ul class="dx-toc__list">
      {props.entries.map((h) => (
        <li class={h.level === 3 ? 'dx-toc__item dx-toc__item--sub' : 'dx-toc__item'}>
          <a href={`#${h.slug}`} class="dx-toc__link">
            {h.text}
          </a>
        </li>
      ))}
    </ul>
  )
}

/** The right rail's "On this page" (≥ 1180px). Static; `startScrollSpy` marks the current section. */
export function RailToc(props: { entries: readonly TocHeading[] }) {
  return (
    <nav class="dx-toc" aria-labelledby="dx-toc-title">
      <p class="dx-eyebrow" id="dx-toc-title">
        On this page
      </p>
      <TocList entries={props.entries} />
    </nav>
  )
}

/**
 * The same list under the title below 1180px, collapsed by default: a native
 * `<details>`, so it opens and its links work with no script. Once the page's
 * enhance island runs, a pick also closes it, so the reader lands on the
 * section, not on an open list.
 */
export function InlineToc(props: { entries: readonly TocHeading[] }) {
  return (
    <details class="dx-toc-inline">
      <summary class="dx-toc-inline__summary">On this page</summary>
      <nav aria-label="On this page">
        <TocList entries={props.entries} />
      </nav>
    </details>
  )
}
