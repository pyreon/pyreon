import { RouterLink } from '@pyreon/router'
import { ThemeToggle } from './ThemeToggle'

export function TopBar() {
  return (
    <header class="topbar">
      <RouterLink to="/" class="brand">
        <span class="mark">P</span>
        <span>Pyreon</span>
      </RouterLink>
      <nav class="main">
        <RouterLink to="/docs/reactivity">Docs</RouterLink>
        <a href="https://github.com/pyreon/pyreon" target="_blank" rel="noopener">
          GitHub
        </a>
      </nav>
      <span class="spacer" />
      <div class="actions">
        <ThemeToggle />
      </div>
    </header>
  )
}
