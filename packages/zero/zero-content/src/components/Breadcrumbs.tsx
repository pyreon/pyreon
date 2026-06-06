import { computed } from '@pyreon/reactivity'
import type { VNodeChild } from '@pyreon/core'
import type { SidebarEntry } from './Sidebar'

// ─── <Breadcrumbs> — current-page path crumbs ─────────────────────────────
//
// Renders a `Home › Section › Page` crumb trail derived from the
// current URL. Each segment becomes a link to a parent path, with the
// final segment rendered as plain text (current page).
//
// Two modes:
//
//   1. **Auto** (default): derive labels from the URL path segments,
//      title-casing each. `/docs/getting-started` → `Home › Docs ›
//      Getting Started`.
//
//   2. **Lookup**: pass an `entries` array (typically the same one
//      supplied to <Sidebar>). The breadcrumb walks the URL hierarchy
//      and uses each parent's `title` field from the entry array when
//      a match exists. Falls back to auto title-casing for unmatched
//      segments.

export interface BreadcrumbsProps {
  /** Reactive accessor returning the current pathname. */
  currentPath: () => string
  /** Optional homepage label. Default: "Home". */
  homeLabel?: string
  /** Optional homepage URL. Default: "/". */
  homeUrl?: string
  /** Lookup table — when provided, each crumb's display title is
   *  resolved by URL match against this list. Falls back to
   *  title-cased segment otherwise. */
  entries?: SidebarEntry[]
}

export interface BreadcrumbCrumb {
  /** Display label. */
  title: string
  /** Target URL. */
  url: string
  /** Whether this crumb is the current page (last in the trail). */
  current: boolean
}

/**
 * Build the breadcrumb crumb list from a URL + optional entry lookup.
 * Pure — exported for testing.
 *
 * @internal exported for testing
 */
export function buildBreadcrumbs(
  currentPath: string,
  homeLabel: string,
  homeUrl: string,
  entries: SidebarEntry[] | undefined,
): BreadcrumbCrumb[] {
  // Strip trailing slash (but never the root). Splits on `/`; empty
  // segments are dropped, including any leading slash's empty piece.
  const trimmed = currentPath.length > 1 && currentPath.endsWith('/')
    ? currentPath.slice(0, -1)
    : currentPath
  const segments = trimmed.split('/').filter((s) => s.length > 0)

  const crumbs: BreadcrumbCrumb[] = [
    { title: homeLabel, url: homeUrl, current: trimmed === homeUrl || trimmed === '' },
  ]

  let acc = ''
  for (let i = 0; i < segments.length; i++) {
    acc += '/' + segments[i]
    const isLast = i === segments.length - 1
    const fromEntry = entries?.find((e) => e.url === acc)
    const title = fromEntry?.title ?? humanize(segments[i]!)
    crumbs.push({ title, url: acc, current: isLast })
  }

  return crumbs
}

/**
 * Title-case a URL segment. `getting-started` → `Getting Started`.
 *
 * @internal exported for testing
 */
export function humanize(segment: string): string {
  return segment
    .split('-')
    .filter((s) => s.length > 0)
    .map((s) => s[0]!.toUpperCase() + s.slice(1))
    .join(' ')
}

export function Breadcrumbs(props: BreadcrumbsProps): VNodeChild {
  const homeLabel = props.homeLabel ?? 'Home'
  const homeUrl = props.homeUrl ?? '/'
  const crumbs = computed(() =>
    buildBreadcrumbs(props.currentPath(), homeLabel, homeUrl, props.entries),
  )

  return (
    <nav class="pyreon-breadcrumbs" aria-label="Breadcrumb">
      <ol class="pyreon-breadcrumbs__list">
        {() =>
          crumbs().map((c, i) => (
            <li class="pyreon-breadcrumbs__item">
              {c.current
                ? (
                  <span
                    class="pyreon-breadcrumbs__crumb pyreon-breadcrumbs__crumb--current"
                    aria-current="page"
                  >
                    {c.title}
                  </span>
                )
                : (
                  <a class="pyreon-breadcrumbs__crumb" href={c.url}>
                    {c.title}
                  </a>
                )}
              {i < crumbs().length - 1 && (
                <span class="pyreon-breadcrumbs__separator" aria-hidden="true">
                  ›
                </span>
              )}
            </li>
          ))
        }
      </ol>
    </nav>
  )
}
