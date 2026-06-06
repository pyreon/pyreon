import { onMount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { RouterLink, useRoute } from '@pyreon/router'
import { SIDEBAR, type SidebarGroup } from '../sidebar-config'

interface SidebarProps {
  /** Optional callback fired when a link is clicked — used by the
   * mobile drawer to close itself. */
  onNavigate?: () => void
}

const STORAGE_KEY = 'pyreon-docs-sidebar-collapsed'

/**
 * Read the persisted collapsed/expanded state for a sidebar group.
 * The store is a `Record<groupText, boolean>` (true = collapsed). When
 * the user has never touched a group, fall back to the group's config
 * default — matching VitePress' `collapsed: true/false` field on each
 * `SidebarItem`.
 */
function loadCollapsedState(): Record<string, boolean> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, boolean>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveCollapsedState(state: Record<string, boolean>): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Quota / disabled — ignore.
  }
}

/**
 * Resolve the current docs slug from the live router route, so the
 * active-link highlight updates reactively on every navigation. The
 * strip-path shape mirrors VitePress' `/docs/<slug>` URLs.
 */
function useDocsSlug(): () => string {
  const route = useRoute()
  return () => {
    const path = route().path
    if (typeof path !== 'string') return ''
    const trimmed = path.replace(/^\/+|\/+$/g, '')
    if (trimmed === 'docs') return ''
    if (trimmed.startsWith('docs/')) return trimmed.slice('docs/'.length)
    return ''
  }
}

/**
 * Sidebar — renders configured groups + items from `sidebar-config.ts`
 * (single source of truth for nav, ported from VitePress' `sidebar:
 * { '/docs/': [...] }` config). Active highlighting reads the live
 * router slug, so navigation updates without remount. Groups respect
 * the config's `collapsed?: true` default but the user's
 * click-to-toggle state takes precedence and persists across reloads.
 */
export function Sidebar(props: SidebarProps) {
  const currentSlug = useDocsSlug()
  const collapsedState = signal<Record<string, boolean>>({})

  onMount(() => {
    collapsedState.set(loadCollapsedState())
  })

  const isCollapsed = (group: SidebarGroup): boolean => {
    const state = collapsedState()
    if (Object.prototype.hasOwnProperty.call(state, group.text)) {
      return state[group.text]!
    }
    return group.collapsed === true
  }

  const toggle = (group: SidebarGroup) => {
    const state = { ...collapsedState() }
    state[group.text] = !isCollapsed(group)
    collapsedState.set(state)
    saveCollapsedState(state)
  }

  return (
    <nav class="pyreon-sidebar" aria-label="Documentation sidebar">
      {SIDEBAR.map((group) => (
        <div class="pyreon-sidebar__group">
          <button
            type="button"
            class="pyreon-sidebar__group-title"
            onClick={() => toggle(group)}
            aria-expanded={() => (isCollapsed(group) ? 'false' : 'true')}
          >
            <span>{group.text}</span>
            <svg
              class={() =>
                isCollapsed(group)
                  ? 'pyreon-sidebar__chevron pyreon-sidebar__chevron--collapsed'
                  : 'pyreon-sidebar__chevron'
              }
              viewBox="0 0 24 24"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {() =>
            isCollapsed(group) ? null : (
              <ul class="pyreon-sidebar__list">
                {group.items.map((item) => {
                  const to = item.slug === '' ? '/docs/' : `/docs/${item.slug}`
                  return (
                    <li class="pyreon-sidebar__item">
                      <RouterLink
                        to={to}
                        class={() =>
                          currentSlug() === item.slug
                            ? 'pyreon-sidebar__link pyreon-sidebar__link--active'
                            : 'pyreon-sidebar__link'
                        }
                        onClick={() => props.onNavigate?.()}
                      >
                        {item.text}
                      </RouterLink>
                    </li>
                  )
                })}
              </ul>
            )
          }
        </div>
      ))}
    </nav>
  )
}
