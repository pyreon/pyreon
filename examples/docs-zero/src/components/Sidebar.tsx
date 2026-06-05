import { RouterLink } from '@pyreon/router'
import { signal } from '@pyreon/reactivity'
import { SIDEBAR } from '../sidebar-config'

interface SidebarProps {
  currentSlug: string
  /** Closes the mobile drawer after a link click. */
  onNavigate?: () => void
}

// Sidebar — collapsible groups + active highlighting + mobile-drawer
// aware navigation. Group state persists per-session in
// `sessionStorage` so refreshing a page keeps the user's chosen
// expanded/collapsed state.
//
// `collapsed: true` in sidebar-config.ts starts the group collapsed
// (matches VitePress's same field). Default = expanded.
export function Sidebar(props: SidebarProps) {
  return (
    <nav class="pyreon-sidebar" aria-label="Documentation sidebar">
      {SIDEBAR.map((group) => {
        const expanded = signal(loadGroupState(group.text, group.collapsed === true))
        const toggle = () => {
          const next = !expanded()
          expanded.set(next)
          saveGroupState(group.text, !next)
        }
        return (
          <div class="pyreon-sidebar__group">
            <button
              type="button"
              class={() =>
                expanded()
                  ? 'pyreon-sidebar__group-title pyreon-sidebar__group-title--expanded'
                  : 'pyreon-sidebar__group-title pyreon-sidebar__group-title--collapsed'
              }
              aria-expanded={() => (expanded() ? 'true' : 'false')}
              onClick={toggle}
            >
              <span>{group.text}</span>
              <span class="pyreon-sidebar__chevron" aria-hidden="true">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M9 18l6-6-6-6"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </span>
            </button>
            <ul
              class={() =>
                expanded()
                  ? 'pyreon-sidebar__list'
                  : 'pyreon-sidebar__list pyreon-sidebar__list--collapsed'
              }
            >
              {group.items.map((item) => {
                const isActive = item.slug === props.currentSlug
                const linkClass = isActive
                  ? 'pyreon-sidebar__link pyreon-sidebar__link--active'
                  : 'pyreon-sidebar__link'
                const to = item.slug === '' ? '/docs/' : `/docs/${item.slug}`
                const handleClick = props.onNavigate
                  ? () => props.onNavigate?.()
                  : undefined
                if (isActive) {
                  return (
                    <li class="pyreon-sidebar__item">
                      <RouterLink
                        to={to}
                        class={linkClass}
                        aria-current="page"
                        onClick={handleClick}
                      >
                        {item.text}
                      </RouterLink>
                    </li>
                  )
                }
                return (
                  <li class="pyreon-sidebar__item">
                    <RouterLink
                      to={to}
                      class={linkClass}
                      onClick={handleClick}
                    >
                      {item.text}
                    </RouterLink>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}

const STATE_KEY = 'pyreon-docs-sidebar-collapsed'

interface CollapsedMap {
  [groupText: string]: boolean
}

function loadGroupState(group: string, defaultCollapsed: boolean): boolean {
  if (typeof sessionStorage === 'undefined') return !defaultCollapsed
  try {
    const raw = sessionStorage.getItem(STATE_KEY)
    if (!raw) return !defaultCollapsed
    const map = JSON.parse(raw) as CollapsedMap
    if (group in map) return !map[group]
    return !defaultCollapsed
  } catch {
    return !defaultCollapsed
  }
}

function saveGroupState(group: string, collapsed: boolean) {
  if (typeof sessionStorage === 'undefined') return
  try {
    const raw = sessionStorage.getItem(STATE_KEY)
    const map: CollapsedMap = raw ? (JSON.parse(raw) as CollapsedMap) : {}
    map[group] = collapsed
    sessionStorage.setItem(STATE_KEY, JSON.stringify(map))
  } catch {
    // ignore
  }
}
