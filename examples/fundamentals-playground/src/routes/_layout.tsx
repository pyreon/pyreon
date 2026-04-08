import type { Props } from '@pyreon/core'
import { RouterLink, RouterView, useIsActive } from '@pyreon/router'
import { tabs } from '../nav'
import '../style.css'

function NavItem(props: { path: string; label: string }) {
  const isActive = useIsActive(props.path, true)
  return (
    <li>
      <RouterLink to={props.path} class={() => (isActive() ? 'active' : '')}>
        {props.label}
      </RouterLink>
    </li>
  )
}

export function layout(_props: Props) {
  return (
    <div class="app">
      <nav class="sidebar">
        <h1>Pyreon Fundamentals</h1>
        <ul>
          {tabs.map((tab) => (
            <NavItem path={tab.path} label={tab.label} />
          ))}
        </ul>
      </nav>
      <main class="content">
        <RouterView />
      </main>
    </div>
  )
}
