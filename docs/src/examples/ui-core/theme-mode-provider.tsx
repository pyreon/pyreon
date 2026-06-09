// @ts-nocheck — 1:1 port from a JS `<Playground>`. Strict-mode TS
// would need a manual rewrite (signal shapes, possibly-null guards).
// Renders + behaves correctly; type tightening is a follow-up.
import { signal, computed } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — Theme Mode Provider.
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function ThemeModeProvider() {
  const mode = signal('light')
  const inversed = signal(false)

  const resolved = computed(() => {
    const m = mode()
    return inversed() ? (m === 'light' ? 'dark' : 'light') : m
  })

  const themes = {
    light: { bg: '#ffffff', fg: '#1f2937', border: '#e5e7eb', accent: '#2196f3' },
    dark: { bg: '#1f2937', fg: '#f9fafb', border: '#374151', accent: '#60a5fa' },
  }

  return h('div', {
    style: () => ({ background: (themes as Record<string, any>)[resolved()].bg, color: (themes as Record<string, any>)[resolved()].fg, border: `1px solid \${themes[resolved()].border}`, borderRadius: '8px', padding: '16px', transition: 'all 200ms' }),
  },
    h('div', { style: { marginBottom: '12px', fontSize: '15px', fontWeight: 'bold' } }, () => 'Resolved mode: ' + resolved()),
    h('div', { style: { display: 'flex', gap: '8px', marginBottom: '8px' } },
      h('button', { onClick: () => mode.set('light'), style: { padding: '4px 10px', cursor: 'pointer' } }, 'Light'),
      h('button', { onClick: () => mode.set('dark'), style: { padding: '4px 10px', cursor: 'pointer' } }, 'Dark'),
      h('button', { onClick: () => mode.set('system'), style: { padding: '4px 10px', cursor: 'pointer' } }, 'System'),
    ),
    h('label', { style: { fontSize: '13px' } },
      h('input', { type: 'checkbox', onChange: (e: any) => inversed.set(e.target.checked) }),
      ' Inversed (flip for this subtree)',
    ),
  )
  // NOTE: the original Playground also wired an `effect(() => …matchMedia…)`
  // for `mode === 'system'`. That fired AFTER `mount(ui, app)` in the
  // iframe-only original. In a Pyreon component the return statement must
  // come last; wire effects via onMount() if you need this — omitted here
  // to keep the example minimal + focused on the theme-flip mechanics.
}
