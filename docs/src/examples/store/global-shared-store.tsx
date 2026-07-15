import { defineStore } from '@pyreon/store'
import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Singleton behaviour, made visible. Both panels call the SAME `useLevel()`
 * store, so they resolve to one shared instance — pressing a panel's control
 * grows (or shrinks) the bar in BOTH panels at once. State lives once, in the
 * store; the panels are just two views of it.
 */
const useLevel = defineStore('docs-shared-level', () => {
  const level = signal(2)
  const inc = () => level.set(Math.min(6, level() + 1))
  const dec = () => level.set(Math.max(0, level() - 1))
  return { level, inc, dec }
})

export default function GlobalSharedStore() {
  const panel = (accent: string) => {
    const { store } = useLevel()
    const ctrl = (aria: string, onClick: () => void, bg: string) =>
      h('button', {
        onClick,
        'aria-label': aria,
        style: {
          width: '30px',
          height: '24px',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          background: bg,
        },
      })
    return h(
      'div',
      { class: 'col', style: { alignItems: 'center', gap: '10px' } },
      h(
        'div',
        { style: { height: '128px', display: 'flex', alignItems: 'flex-end' } },
        h('div', {
          class: 'bar',
          style: () => ({
            width: '34px',
            height: `${store.level() * 18 + 10}px`,
            borderRadius: '6px',
            background: accent,
            transition: 'height 0.2s',
          }),
        }),
      ),
      h(
        'div',
        { class: 'row', style: { gap: '6px' } },
        ctrl('increase', () => store.inc(), '#4ade80'),
        ctrl('decrease', () => store.dec(), '#cbd5e1'),
      ),
    )
  }

  return h(
    'div',
    { class: 'row', style: { justifyContent: 'center', gap: '40px', padding: '20px' } },
    panel('#60a5fa'),
    panel('#a78bfa'),
  )
}
