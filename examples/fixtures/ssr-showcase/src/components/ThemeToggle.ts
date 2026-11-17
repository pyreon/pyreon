import { h } from '@pyreon/core'
import { resolvedTheme, toggleTheme } from '@pyreon/zero'

/**
 * Theme toggle button.
 * Tests theme reactivity and persistence.
 */
export function ThemeToggle() {
  return h('button', {
    'data-testid': 'theme-toggle',
    onClick: () => toggleTheme(),
  }, () => `Theme: ${resolvedTheme()}`)
}
