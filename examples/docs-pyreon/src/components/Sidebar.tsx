import { RouterLink, useRouter } from '@pyreon/router'
import { nav } from '../content/nav'

export function Sidebar() {
  const router = useRouter()
  return (
    <aside class="sidebar">
      {nav.map((section) => (
        <div>
          <div class="section-title">{section.title}</div>
          {section.items.map((item) => (
            <RouterLink
              to={item.href}
              class={() => (router.currentRoute().path === item.href ? 'active' : '')}
            >
              {item.title}
            </RouterLink>
          ))}
        </div>
      ))}
    </aside>
  )
}
