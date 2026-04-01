import type { Props } from '@pyreon/core'
import { h } from '@pyreon/core'
import { RouterLink, RouterView } from '@pyreon/router'
import { initTheme } from '@pyreon/zero'
import { ThemeToggle } from '../components/ThemeToggle'

import '../global.css'

/**
 * Root layout — nav + theme toggle + router view.
 * Layout components use <RouterView /> to render child routes,
 * not props.children (the router handles nesting).
 */
export function layout(_props: Props) {
  initTheme()

  return h('div', { id: 'layout' },
    h('nav', null,
      h(RouterLink, { to: '/', 'data-testid': 'nav-home' }, 'Home'),
      h(RouterLink, { to: '/about', 'data-testid': 'nav-about' }, 'About'),
      h(RouterLink, { to: '/posts', 'data-testid': 'nav-posts' }, 'Posts'),
      h(ThemeToggle, null),
    ),
    h('main', null,
      h(RouterView, null),
    ),
  )
}
