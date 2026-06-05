import { RouterLink } from '@pyreon/router'
import { SIDEBAR } from '../sidebar-config'

interface SidebarProps {
  currentSlug: string
}

// Sidebar renders the configured groups + items from sidebar-config.ts
// (single source of truth for nav, ported from the VitePress
// `sidebar: { '/docs/': [...] }` config). Active highlighting matches
// on slug equality; the link element flips its own active class.
export function Sidebar(props: SidebarProps) {
  return (
    <nav class="pyreon-sidebar" aria-label="Documentation sidebar">
      {SIDEBAR.map((group) => (
        <div class="pyreon-sidebar__group">
          <h3 class="pyreon-sidebar__group-title">{group.text}</h3>
          <ul class="pyreon-sidebar__list">
            {group.items.map((item) => {
              const isActive = item.slug === props.currentSlug
              const linkClass = isActive
                ? 'pyreon-sidebar__link pyreon-sidebar__link--active'
                : 'pyreon-sidebar__link'
              const to = item.slug === '' ? '/docs/' : `/docs/${item.slug}`
              if (isActive) {
                return (
                  <li class="pyreon-sidebar__item">
                    <RouterLink to={to} class={linkClass} aria-current="page">
                      {item.text}
                    </RouterLink>
                  </li>
                )
              }
              return (
                <li class="pyreon-sidebar__item">
                  <RouterLink to={to} class={linkClass}>
                    {item.text}
                  </RouterLink>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
