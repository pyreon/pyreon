import { RouterLink } from '@pyreon/router'

interface NavEntry {
  title: string
  slug: string
}

interface SidebarProps {
  entries: () => NavEntry[]
  currentSlug: string
}

export function Sidebar(props: SidebarProps) {
  return (
    <nav class="docs-sidebar" aria-label="Documentation">
      <ul class="docs-sidebar__list">
        {() =>
          props.entries().map((entry) => (
            <li class="docs-sidebar__item">
              <RouterLink
                to={`/docs/${entry.slug}`}
                class={
                  entry.slug === props.currentSlug
                    ? 'docs-sidebar__link docs-sidebar__link--active'
                    : 'docs-sidebar__link'
                }
              >
                {entry.title}
              </RouterLink>
            </li>
          ))
        }
      </ul>
    </nav>
  )
}
