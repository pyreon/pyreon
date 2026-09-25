import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

type Perm = 'read' | 'write' | 'admin'

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
  // wildcard, all(), any(), and context-passing on top of this shape —
  // see the "rbac-role-tiles" / "wildcard-grant-tiles" examples on this
  // page for that. This is the minimal shape it wraps.
  const permissions = signal<Record<Perm, boolean>>({ read: true, write: false, admin: false })
  const can = (key: Perm) => permissions()[key] === true
  const toggle = (key: Perm) => permissions.update(p => ({ ...p, [key]: !p[key] }))

  const Row = (key: Perm) =>
    h('div', { class: 'row', style: { justifyContent: 'space-between' } },
      h('span', null, key),
      h('span', { class: 'badge', style: () => ({ background: can(key) ? null : 'transparent', color: can(key) ? null : 'var(--muted)' }) },
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
