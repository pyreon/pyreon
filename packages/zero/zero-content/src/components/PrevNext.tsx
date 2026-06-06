import { computed } from '@pyreon/reactivity'
import type { VNodeChild } from '@pyreon/core'
import type { SidebarEntry } from './Sidebar'

// ─── <PrevNext> — inter-page navigation footer ────────────────────────────
//
// Renders "← Previous" / "Next →" links derived from a flattened entry
// list + the current path. The list is typically the SAME entry array
// supplied to <Sidebar>, so the prev/next order matches the sidebar's
// rendered order. Empty when the current page isn't in the list.

export interface PrevNextProps {
  /** Flat list of pages in navigation order. Same shape as `<Sidebar>`'s
   *  `entries`; consumers typically pass the same array. */
  entries: SidebarEntry[]
  /** Reactive accessor returning the current pathname. */
  currentPath: () => string
  /** Optional label override; defaults to "Previous" / "Next". */
  labels?: {
    previous?: string
    next?: string
  }
}

interface PrevNextResolved {
  prev: SidebarEntry | null
  next: SidebarEntry | null
}

/**
 * Pure resolver — given a flat entry list and a current URL, return the
 * prev/next entries. Exported for testing + downstream reuse.
 *
 * @internal exported for testing
 */
export function resolvePrevNext(
  entries: SidebarEntry[],
  currentPath: string,
): PrevNextResolved {
  const idx = entries.findIndex((e) => e.url === currentPath)
  if (idx === -1) return { prev: null, next: null }
  return {
    prev: idx > 0 ? entries[idx - 1]! : null,
    next: idx < entries.length - 1 ? entries[idx + 1]! : null,
  }
}

export function PrevNext(props: PrevNextProps): VNodeChild {
  const prevLabel = props.labels?.previous ?? 'Previous'
  const nextLabel = props.labels?.next ?? 'Next'
  const resolved = computed(() => resolvePrevNext(props.entries, props.currentPath()))

  return (
    <nav class="pyreon-prevnext" aria-label="Page navigation">
      {() => {
        const { prev, next } = resolved()
        return (
          <>
            {prev && (
              <a
                href={prev.url}
                class="pyreon-prevnext__link pyreon-prevnext__link--prev"
                rel="prev"
              >
                <span class="pyreon-prevnext__direction" aria-hidden="true">
                  ←
                </span>
                <span class="pyreon-prevnext__meta">
                  <span class="pyreon-prevnext__label">{prevLabel}</span>
                  <span class="pyreon-prevnext__title">{prev.title}</span>
                </span>
              </a>
            )}
            {next && (
              <a
                href={next.url}
                class="pyreon-prevnext__link pyreon-prevnext__link--next"
                rel="next"
              >
                <span class="pyreon-prevnext__meta">
                  <span class="pyreon-prevnext__label">{nextLabel}</span>
                  <span class="pyreon-prevnext__title">{next.title}</span>
                </span>
                <span class="pyreon-prevnext__direction" aria-hidden="true">
                  →
                </span>
              </a>
            )}
          </>
        )
      }}
    </nav>
  )
}
