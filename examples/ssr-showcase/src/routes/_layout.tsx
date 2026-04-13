/**
 * Root layout — wraps every route in PyreonUI with a reactive `mode`.
 * The ModeToggle flips mode via a signal; PyreonUI consumes it via the
 * function form (`mode={() => modeSignal()}`) so every consumer of the
 * mode context updates reactively.
 *
 * Routes can opt into sections-style rendering by being wrapped in
 * additional section-level Background/Section components.
 */

import type { Props } from '@pyreon/core'
import { RouterLink, RouterView } from '@pyreon/router'
import { PyreonUI } from '@pyreon/ui-core'
import { initTheme } from '@pyreon/zero'
import { ModeToggle, modeSignal } from '../components/ModeToggle'
import { ThemeToggle } from '../components/ThemeToggle'
import { theme } from '../theme'

import '../global.css'

export function layout(_props: Props) {
  initTheme()

  return (
    <PyreonUI theme={theme} mode={() => modeSignal()}>
      <div id="layout">
        <nav style="display: flex; gap: 16px; padding: 16px; border-bottom: 1px solid #eee; align-items: center; font-family: system-ui, sans-serif;">
          <RouterLink to="/" data-testid="nav-home">Home</RouterLink>
          <RouterLink to="/about" data-testid="nav-about">About</RouterLink>
          <RouterLink to="/posts" data-testid="nav-posts">Posts</RouterLink>
          <RouterLink to="/sections" data-testid="nav-sections">Sections</RouterLink>
          <span style="flex: 1;" />
          <ThemeToggle />
          <ModeToggle />
        </nav>
        <main>
          <RouterView />
        </main>
      </div>
    </PyreonUI>
  )
}
