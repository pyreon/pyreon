import { createPermissions } from '@pyreon/permissions'
import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Role-based access as reactive tiles. Flipping the switch (viewer ↔ admin)
 * calls `can.set()` with a different permission map; each tile reads
 * `can(key)` inside a reactive style thunk, so the grid lights up in place —
 * no re-mount, no manual wiring.
 */
export default function RbacRoleTiles() {
  const can = createPermissions({ 'posts.read': true })
  const admin = signal(false)

  const setAdmin = (next: boolean) => {
    admin.set(next)
    can.set(
      next
        ? { 'posts.read': true, 'posts.write': true, 'posts.delete': true, admin: true }
        : { 'posts.read': true },
    )
  }

  const tiles: [string, string][] = [
    ['posts.read', '#60a5fa'],
    ['posts.write', '#4ade80'],
    ['posts.delete', '#f87171'],
    ['admin', '#a78bfa'],
  ]
  const tile = (key: string, color: string) =>
    h('div', {
      style: () => ({
        width: '46px',
        height: '46px',
        borderRadius: '10px',
        background: can(key) ? color : '#e2e8f0',
        transition: 'background 0.25s',
      }),
    })

  return h(
    'div',
    { class: 'col', style: { alignItems: 'center', gap: '18px', padding: '22px' } },
    h(
      'button',
      {
        onClick: () => setAdmin(!admin.peek()),
        'aria-label': 'toggle admin role',
        style: () => ({
          width: '68px',
          height: '36px',
          padding: '4px',
          border: 'none',
          borderRadius: '18px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: admin() ? 'flex-end' : 'flex-start',
          background: admin() ? '#a78bfa' : '#e2e8f0',
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
    h('div', { class: 'row', style: { gap: '12px' } }, ...tiles.map(([k, c]) => tile(k, c))),
  )
}
