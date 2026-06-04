import { signal, computed } from '@pyreon/reactivity'
import { onMount } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import type { Heading } from '../types'

// ─── <Toc> — page table-of-contents with scroll-spy ───────────────────────
//
// Renders a flat list of level-2/3 headings + tracks which is currently
// in view via `IntersectionObserver`. The active heading flips its
// `aria-current` and applies a `.pyreon-toc__link--active` class.
//
// SSR-safe: when `IntersectionObserver` is undefined (no window) the
// component still emits the heading list — just without scroll-spy
// state. The reactive active-id signal lives client-side only.

export interface TocProps {
  /** Headings exported by the compiled markdown module. */
  headings: Heading[]
  /** Container element class — useful when the host wants the TOC
   *  styled differently in different layout contexts. */
  class?: string
  /** Min level to include. Default 2. */
  minLevel?: number
  /** Max level to include. Default 3. */
  maxLevel?: number
  /** Reactive accessor; defaults to listening to the IntersectionObserver
   *  internally. Pass a custom accessor to drive scroll-spy externally. */
  activeSlug?: () => string | null
}

/**
 * Filter headings by level range. Pure — exported for testing.
 *
 * @internal exported for testing
 */
export function filterHeadings(
  headings: Heading[],
  minLevel: number,
  maxLevel: number,
): Heading[] {
  return headings.filter((h) => h.level >= minLevel && h.level <= maxLevel)
}

export function Toc(props: TocProps): VNodeChild {
  const minLevel = props.minLevel ?? 2
  const maxLevel = props.maxLevel ?? 3
  const filtered = computed(() =>
    filterHeadings(props.headings, minLevel, maxLevel),
  )

  // Internal scroll-spy state. Used only when no external `activeSlug`
  // accessor is supplied.
  const internalActive = signal<string | null>(null)
  const activeSlug = props.activeSlug ?? (() => internalActive())

  onMount(() => {
    if (props.activeSlug) return undefined
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      return undefined
    }
    const slugs = filtered().map((h) => h.slug)
    if (slugs.length === 0) return undefined
    const elements = slugs
      .map((s) => document.getElementById(s))
      .filter((el): el is HTMLElement => el !== null)
    if (elements.length === 0) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the topmost intersecting heading.
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length === 0) return
        visible.sort(
          (a, b) =>
            a.target.getBoundingClientRect().top -
            b.target.getBoundingClientRect().top,
        )
        const id = visible[0]!.target.id
        if (id) internalActive.set(id)
      },
      { rootMargin: '0px 0px -60% 0px', threshold: 0 },
    )
    for (const el of elements) observer.observe(el)
    return () => observer.disconnect()
  })

  return (
    <aside
      class={() => `pyreon-toc${props.class ? ' ' + props.class : ''}`}
      aria-label="On this page"
    >
      <nav class="pyreon-toc__nav">
        <ul class="pyreon-toc__list">
          {() =>
            filtered().map((h) => (
              <li class={`pyreon-toc__item pyreon-toc__item--l${h.level}`}>
                <a
                  href={`#${h.slug}`}
                  class={() =>
                    activeSlug() === h.slug
                      ? 'pyreon-toc__link pyreon-toc__link--active'
                      : 'pyreon-toc__link'
                  }
                  aria-current={
                    (() =>
                      activeSlug() === h.slug
                        ? 'location'
                        : false) as never
                  }
                >
                  {h.text}
                </a>
              </li>
            ))
          }
        </ul>
      </nav>
    </aside>
  )
}
