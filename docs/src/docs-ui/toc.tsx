import { For, onMount, Show } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

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
 * Scroll-spy: the slug of the last heading whose top has passed the line
 * under the fixed nav. IntersectionObserver wakes it (no scroll listener for
 * the common case); positions are re-read on every wake so late layout
 * (images, demos) never leaves it stale. Returns a signal both TOC variants
 * read, so the page runs one observer.
 */
export function useScrollSpy(slugs: () => readonly string[], offset = 96): () => string | undefined {
  const active = signal<string | undefined>(undefined)
  onMount(() => {
    const els = slugs()
      .map((s) => document.getElementById(s))
      .filter((e): e is HTMLElement => e !== null)
    if (els.length === 0 || typeof IntersectionObserver === 'undefined') return undefined
    let raf = 0
    const pick = () => {
      raf = 0
      let current: string | undefined = els[0]?.id
      for (const el of els) {
        if (el.getBoundingClientRect().top - offset <= 1) current = el.id
        else break
      }
      active.set(current)
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
  })
  return active
}

function TocList(props: { entries: readonly TocHeading[]; active: () => string | undefined; onPick?: () => void }) {
  return (
    <ul class="dx-toc__list">
      <For each={props.entries} by={(h) => h.slug}>
        {(h) => (
          <li class={h.level === 3 ? 'dx-toc__item dx-toc__item--sub' : 'dx-toc__item'}>
            <a
              href={`#${h.slug}`}
              class="dx-toc__link"
              aria-current={() => (props.active() === h.slug ? 'location' : undefined)}
              onClick={() => props.onPick?.()}
            >
              {h.text}
            </a>
          </li>
        )}
      </For>
    </ul>
  )
}

/** The right rail's "On this page" (≥ 1180px). */
export function RailToc(props: { entries: readonly TocHeading[]; active: () => string | undefined }) {
  return (
    <Show when={() => props.entries.length > 0}>
      <nav class="dx-toc" aria-labelledby="dx-toc-title">
        <p class="dx-eyebrow" id="dx-toc-title">
          On this page
        </p>
        <TocList entries={props.entries} active={props.active} />
      </nav>
    </Show>
  )
}

/**
 * The same list under the title below 1180px, collapsed by default (a native
 * `<details>`: keyboard and screen-reader behaviour for free). Closes after a
 * pick so the reader lands on the section, not on an open list.
 */
export function InlineToc(props: { entries: readonly TocHeading[]; active: () => string | undefined }) {
  let details: HTMLDetailsElement | null = null
  return (
    <Show when={() => props.entries.length > 0}>
      <details
        class="dx-toc-inline"
        ref={(el: HTMLDetailsElement | null) => {
          details = el
        }}
      >
        <summary class="dx-toc-inline__summary">On this page</summary>
        <nav aria-label="On this page">
          <TocList
            entries={props.entries}
            active={props.active}
            onPick={() => {
              if (details) details.open = false
            }}
          />
        </nav>
      </details>
    </Show>
  )
}
