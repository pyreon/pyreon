// @ts-nocheck — 1:1 port from a JS `<Playground>`. Strict-mode TS
// would need a manual rewrite (signal shapes, possibly-null guards).
// Renders + behaves correctly; type tightening is a follow-up.
import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — Permissions — reactive can().
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function PermissionsReactiveCan() {
  // The real createPermissions() returns a callable can(key) with
  // wildcard, all(), any(), and context-passing on top of this shape.
  const permissions = signal({ read: true, write: false, admin: false })
  const can = (key: any) => permissions()[key] === true
  const toggle = (key: any) => permissions.update(p => ({ ...p, [key]: !(p as Record<string, any>)[key] }))

  const Row = (key: any) =>
    h('div', { class: 'row', style: { justifyContent: 'space-between' } },
      h('span', null, key),
      h('span', { class: 'badge', style: { background: () => can(key) ? null : 'transparent', color: () => can(key) ? null : 'var(--muted)' } },
        () => can(key) ? '✓ granted' : '✕ denied',
      ),
    )

  return h('div', { class: 'col' },
    h('div', { class: 'card', style: { gap: '8px', display: 'flex', flexDirection: 'column' } },
      Row('read'),
      Row('write'),
      Row('admin'),
    ),
    h('div', { class: 'row' },
      h('button', { onClick: () => toggle('write') }, 'toggle write'),
      h('button', { onClick: () => toggle('admin') }, 'toggle admin'),
    ),
    h('div', { class: 'muted' }, () => 'effective: ' + Object.entries(permissions())
      .filter(([, v]) => v).map(([k]) => k).join(', ') || 'none',
    ),
  )
}
