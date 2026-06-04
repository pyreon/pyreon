import { computed } from '@pyreon/reactivity'
import type { VNodeChild } from '@pyreon/core'

// ─── <Sidebar> — collection-driven navigation ──────────────────────────────
//
// Reads frontmatter `sidebar.order` + `sidebar.group` from a collection
// snapshot to build a grouped navigation tree. Items without a `group`
// fall under an "" (empty) bucket rendered before the named groups.
//
// Active-link highlighting is automatic: the current location pathname
// is compared against each entry's URL. The lookup is reactive — pass
// in a `currentPath: () => string` accessor so signal changes (router
// navigation) flip the active item.

export interface SidebarEntry {
  /** Display title (shown in the sidebar). */
  title: string
  /** Target URL (the SPA navigation target). */
  url: string
  /** Group label; entries with the same group render under one header. */
  group?: string
  /** Sort key within a group; lower = earlier. Default `Infinity`. */
  order?: number
  /** Optional badge text (e.g. "new", "beta"). */
  badge?: string
}

export interface SidebarProps {
  /** Entries to render. Pre-filtered by the consumer; sorting + grouping
   *  happens inside. */
  entries: SidebarEntry[]
  /** Reactive accessor returning the current pathname. Used for
   *  active-link highlighting. */
  currentPath: () => string
  /** Optional sidebar title (typically the collection name). */
  title?: string
}

interface Group {
  label: string
  items: SidebarEntry[]
}

/**
 * Group entries by `group` field. Default group is `''` (rendered
 * first). Within a group, items are sorted by `order` (asc), then
 * `title` (asc).
 *
 * @internal exported for testing
 */
export function groupEntries(entries: SidebarEntry[]): Group[] {
  const byGroup = new Map<string, SidebarEntry[]>()
  for (const entry of entries) {
    const key = entry.group ?? ''
    const list = byGroup.get(key) ?? []
    list.push(entry)
    byGroup.set(key, list)
  }
  for (const list of byGroup.values()) {
    list.sort((a, b) => {
      const oa = a.order ?? Number.POSITIVE_INFINITY
      const ob = b.order ?? Number.POSITIVE_INFINITY
      if (oa !== ob) return oa - ob
      return a.title.localeCompare(b.title)
    })
  }
  const groups: Group[] = []
  // Default group first, then named groups alphabetically.
  if (byGroup.has('')) groups.push({ label: '', items: byGroup.get('')! })
  const namedKeys = Array.from(byGroup.keys()).filter((k) => k !== '').sort()
  for (const key of namedKeys) {
    groups.push({ label: key, items: byGroup.get(key)! })
  }
  return groups
}

export function Sidebar(props: SidebarProps): VNodeChild {
  const groups = computed(() => groupEntries(props.entries))

  return (
    <nav class="pyreon-sidebar" aria-label="Documentation sidebar">
      {props.title && (
        <h2 class="pyreon-sidebar__title">{props.title}</h2>
      )}
      {() =>
        groups().map((g) => (
          <div class="pyreon-sidebar__group">
            {g.label && (
              <h3 class="pyreon-sidebar__group-title">{g.label}</h3>
            )}
            <ul class="pyreon-sidebar__list">
              {g.items.map((entry) => (
                <li class="pyreon-sidebar__item">
                  <a
                    href={entry.url}
                    class={() =>
                      props.currentPath() === entry.url
                        ? 'pyreon-sidebar__link pyreon-sidebar__link--active'
                        : 'pyreon-sidebar__link'
                    }
                    aria-current={
                      (() =>
                        props.currentPath() === entry.url
                          ? 'page'
                          : false) as never
                    }
                  >
                    {entry.title}
                    {entry.badge && (
                      <span class="pyreon-sidebar__badge">{entry.badge}</span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))
      }
    </nav>
  )
}
