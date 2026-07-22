import { useClickOutside } from '@pyreon/hooks'
import { signal } from '@pyreon/reactivity'
import { Show, h } from '@pyreon/core'

/**
 * useClickOutside calls its handler when a pointer-down lands outside the target
 * element. Click the blue swatch to reveal the panel; the hook registers the
 * panel's own node, so a mousedown anywhere outside it dismisses it — while a
 * press on the panel itself is ignored. The classic popover/menu close behavior.
 */
export default function HooksUseClickOutsideDismissPanel() {
  const open = signal(false)
  let panelEl: HTMLElement | null = null

  useClickOutside(
    () => panelEl,
    () => open.set(false),
  )

  return h(
    'div',
    { class: 'col', style: { alignItems: 'center', gap: '16px', padding: '22px', minHeight: '176px' } },
    h('button', {
      onClick: () => open.set(true),
      style: { padding: '7px 16px', border: 'none', borderRadius: '9px', cursor: 'pointer', background: '#60a5fa', color: '#fff', fontSize: '13px', fontWeight: 600 },
    }, 'Open'),
    h(
      Show,
      { when: () => open() },
      h('div', {
        ref: (el: HTMLElement) => {
          panelEl = el
        },
        class: 'panel',
        style: { width: '124px', height: '86px', borderRadius: '16px', background: '#4ade80' },
      }),
    ),
  )
}
