import { useHotkey } from '@pyreon/hotkeys'
import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Bind several distinct keys to distinct actions: the number keys 1–4 each
 * toggle their own tile (and each tile is clickable too). Because the keysets
 * are distinct, multiple `useHotkey` bindings coexist without conflicting.
 */
export default function HotkeysKeyTiles() {
  const on = [signal(false), signal(false), signal(false), signal(false)]
  const colors = ['#f87171', '#fbbf24', '#4ade80', '#60a5fa']
  const toggle = (i: number) => on[i]!.set(!on[i]!.peek())

  useHotkey('1', () => toggle(0), { preventDefault: true })
  useHotkey('2', () => toggle(1), { preventDefault: true })
  useHotkey('3', () => toggle(2), { preventDefault: true })
  useHotkey('4', () => toggle(3), { preventDefault: true })

  const tile = (i: number) =>
    h('button', {
      onClick: () => toggle(i),
      'aria-label': `toggle ${i + 1}`,
      style: () => ({
        width: '48px',
        height: '48px',
        border: 'none',
        borderRadius: '10px',
        cursor: 'pointer',
        background: on[i]!() ? colors[i]! : '#e2e8f0',
        transition: 'background 0.2s',
      }),
    })

  return h(
    'div',
    { class: 'row tiles', style: { justifyContent: 'center', gap: '12px', padding: '22px' } },
    ...[0, 1, 2, 3].map((i) => tile(i)),
  )
}
