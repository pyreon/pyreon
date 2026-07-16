import { KeepAlive } from '@pyreon/runtime-dom'
import { Show, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

/**
 * KeepAlive vs Show, side by side. Both wrap the same growable bar. Grow both,
 * then toggle them away and back: the LEFT bar (KeepAlive) keeps its height
 * because the component stays mounted and CSS-hidden, while the RIGHT bar
 * (Show) resets — Show unmounts it and remounts a fresh one.
 */
export default function RuntimeKeepAliveVsShow() {
  const shown = signal(true)

  const GrowBar = (props: { accent: string }) => {
    const level = signal(1)
    return h(
      'div',
      { class: 'col', style: { alignItems: 'center', gap: '8px' } },
      h(
        'div',
        { style: { height: '108px', display: 'flex', alignItems: 'flex-end' } },
        h('div', {
          class: 'bar',
          style: () => ({ width: '34px', height: `${level() * 15 + 8}px`, borderRadius: '5px', background: props.accent, transition: 'height 0.2s' }),
        }),
      ),
      h('button', {
        onClick: () => level.set(Math.min(6, level.peek() + 1)),
        'aria-label': 'grow',
        style: { width: '34px', height: '26px', border: 'none', borderRadius: '7px', cursor: 'pointer', background: props.accent },
      }),
    )
  }

  return h(
    'div',
    { class: 'col', style: { alignItems: 'center', gap: '18px', padding: '18px' } },
    h(
      'div',
      { class: 'row', style: { gap: '48px', alignItems: 'flex-start' } },
      h('div', { class: 'keep', style: { minHeight: '142px' } }, h(KeepAlive, { active: () => shown() }, h(GrowBar, { accent: '#4ade80' }))),
      h('div', { class: 'show', style: { minHeight: '142px' } }, h(Show, { when: () => shown() }, h(GrowBar, { accent: '#60a5fa' }))),
    ),
    h('button', {
      onClick: () => shown.set(!shown.peek()),
      'aria-label': 'toggle both',
      style: { width: '52px', height: '28px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: '#a78bfa' },
    }),
  )
}
