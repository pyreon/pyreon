import { h } from '@pyreon/core'
import { PyreonUI, type ThemeModeInput, useMode } from '@pyreon/ui-core'
import { enrichTheme } from '@pyreon/unistyle'
import { signal } from '@pyreon/reactivity'

// Always run a raw theme through enrichTheme() — it fills in default
// breakpoints / rootSize / unit utilities PyreonUI's descendants expect.
const theme = enrichTheme({
  colors: {
    light: { bg: '#ffffff', fg: '#1f2937', border: '#e5e7eb', accent: '#2196f3' },
    dark: { bg: '#1f2937', fg: '#f9fafb', border: '#374151', accent: '#60a5fa' },
  },
})

/**
 * useMode() returns the CURRENT resolved mode, a snapshot — not an
 * accessor. Reading it inside a reactive scope (this style callback runs
 * inside a renderEffect) is what makes it track live; caching the string
 * in a `const` at setup would freeze the panel at whatever mode was
 * active on first render.
 */
function Panel() {
  return h('div', {
    style: () => {
      const c = theme.colors[useMode()]
      return { background: c.bg, color: c.fg, border: `1px solid ${c.border}`, borderRadius: '8px', padding: '16px', transition: 'all 200ms' }
    },
  },
    h('div', { style: { marginBottom: '12px', fontSize: '15px', fontWeight: 'bold' } }, () => 'Resolved mode: ' + useMode()),
  )
}

/**
 * The live counterpart to the "Quick Start" snippet on the UI Core docs
 * page — a REAL `PyreonUI` provider + `useMode()`, not a hand-rolled
 * theme map. `mode` takes an ACCESSOR so flipping the signal re-resolves
 * every descendant that reads `useMode()` inside a reactive scope, with
 * no re-mount.
 */
export default function ThemeModeProvider() {
  const mode = signal<ThemeModeInput>('light')
  const inversed = signal(false)

  return h('div', { class: 'col' },
    h(PyreonUI, { theme, mode: () => mode(), inversed: () => inversed() },
      h(Panel, {}),
    ),
    h('div', { style: { display: 'flex', gap: '8px', margin: '8px 0' } },
      h('button', { onClick: () => mode.set('light'), style: { padding: '4px 10px', cursor: 'pointer' } }, 'Light'),
      h('button', { onClick: () => mode.set('dark'), style: { padding: '4px 10px', cursor: 'pointer' } }, 'Dark'),
      h('button', { onClick: () => mode.set('system'), style: { padding: '4px 10px', cursor: 'pointer' } }, 'System'),
    ),
    h('label', { style: { fontSize: '13px' } },
      h('input', { type: 'checkbox', onChange: (e: any) => inversed.set(e.target.checked) }),
      ' Inversed (flip for this subtree)',
    ),
  )
}
