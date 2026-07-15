import { createPermissions } from '@pyreon/permissions'
import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * A wildcard grant lights a whole namespace at once. `can.set({ 'posts.**':
 * true })` grants every `posts.*` key at ANY depth — so all three tiles turn
 * on together from a single grant (note `posts.comment.create` is two levels
 * deep); `can.clear()` denies everything again.
 */
export default function WildcardGrantTiles() {
  const can = createPermissions()
  const granted = signal(false)

  const toggle = () => {
    const next = !granted.peek()
    granted.set(next)
    if (next) can.set({ 'posts.**': true })
    else can.clear()
  }

  const keys = ['posts.read', 'posts.write', 'posts.comment.create']
  const tile = (key: string) =>
    h('div', {
      style: () => ({
        width: '46px',
        height: '46px',
        borderRadius: '10px',
        background: can(key) ? '#4ade80' : '#e2e8f0',
        transition: 'background 0.25s',
      }),
    })

  return h(
    'div',
    { class: 'col', style: { alignItems: 'center', gap: '18px', padding: '22px' } },
    h('div', { class: 'row', style: { gap: '12px' } }, ...keys.map(tile)),
    h(
      'button',
      {
        onClick: toggle,
        'aria-label': 'toggle wildcard grant',
        style: () => ({
          width: '68px',
          height: '36px',
          padding: '4px',
          border: 'none',
          borderRadius: '18px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: granted() ? 'flex-end' : 'flex-start',
          background: granted() ? '#4ade80' : '#e2e8f0',
          transition: 'background 0.2s',
        }),
      },
      h('div', {
        style: {
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
        },
      }),
    ),
  )
}
