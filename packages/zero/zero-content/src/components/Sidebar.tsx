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
   *  happens inside. Mutually exclusive with `config`. */
  entries?: SidebarEntry[]
  /** Config-driven mode (PR-I audit H11) — pinned groups with explicit
   *  order. When supplied, takes precedence over `entries` and skips
   *  the frontmatter-derived auto-grouping pass. Useful for projects
   *  that want stable navigation structure decoupled from per-file
   *  frontmatter `sidebar.order`. */
  config?: SidebarConfig
  /** Reactive accessor returning the current pathname. Used for
   *  active-link highlighting. */
  currentPath: () => string
  /** Optional sidebar title (typically the collection name). */
  title?: string
}

// ─── defineSidebar — config-driven sidebar (PR-I audit H11) ────────────
//
// Lets users author the sidebar shape in TypeScript instead of relying
// on per-file frontmatter `sidebar.order` / `sidebar.group`. The
// returned config drives <Sidebar config={...}> directly.

export interface SidebarConfigItem {
  /** Display title (shown in the sidebar). */
  title: string
  /** Target URL (the SPA navigation target). */
  url: string
  /** Optional badge text (e.g. "new", "beta"). */
  badge?: string
}

export interface SidebarConfigGroup {
  /** Group label; empty / undefined renders ungrouped. */
  label?: string
  /** Items in display order — no sorting applied. */
  items: SidebarConfigItem[]
}

export interface SidebarConfig {
  groups: SidebarConfigGroup[]
}

/**
 * Define a sidebar config. Returns its input verbatim — typed wrapper
 * for editor autocomplete; no runtime work. Same shape pattern as
 * `defineConfig` / `defineCollection`.
 */
export function defineSidebar(config: SidebarConfig): SidebarConfig {
  return config
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

/**
 * Convert a SidebarConfig into the `Group[]` shape used by the renderer.
 * Preserves authored order — no per-item sort applied (the whole point
 * of config-driven mode is to bypass the auto-sort pass).
 *
 * @internal exported for testing
 */
export function groupsFromConfig(config: SidebarConfig): Group[] {
  return config.groups.map((g) => ({
    label: g.label ?? '',
    items: g.items.map((i) => {
      const e: SidebarEntry = { title: i.title, url: i.url }
      if (i.badge !== undefined) e.badge = i.badge
      return e
    }),
  }))
}

export function Sidebar(props: SidebarProps): VNodeChild {
  const groups = computed(() => {
    if (props.config) return groupsFromConfig(props.config)
    return groupEntries(props.entries ?? [])
  })

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
                    aria-current={() =>
                      props.currentPath() === entry.url ? 'page' : undefined
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
