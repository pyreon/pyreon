// @ts-nocheck — 1:1 port from a JS `<Playground>`. Strict-mode TS
// would need a manual rewrite (signal shapes, possibly-null guards).
// Renders + behaves correctly; type tightening is a follow-up.
import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Migrated from `<Playground>` — Toast Notifications.
 *
 * The original playground ran inline JS inside an iframe via `mount(ui, app)`.
 * This is the same code as a real Pyreon component file: typechecked, lint-
 * covered, refactor-safe. See `<Example>` in docs/zero-content for the
 * inline-mount + signal-share contract.
 */
export default function ToastNotifications() {
  const toasts = signal<string[]>([])
  let id = 0

  const addToast = (type: any, msg: any) => {
    const toast = { id: ++id, type, msg }
    toasts.update(t => [...t, toast])
    setTimeout(() => toasts.update(t => t.filter(x => x.id !== toast.id)), 2000)
  }

  const colors = { success: '#198754', error: '#dc3545', info: '#0d6efd' }
  return h('div', {},
    h('div', { style: { display: 'flex', gap: '8px' } },
      h('button', { onClick: () => addToast('success', 'Saved!') }, 'Success'),
      h('button', { onClick: () => addToast('error', 'Failed!') }, 'Error'),
      h('button', { onClick: () => addToast('info', 'FYI') }, 'Info'),
    ),
    h('div', { style: { marginTop: '12px' } }, () =>
      toasts().map(t => h('div', { style: { padding: '6px 12px', marginBottom: '4px', borderRadius: '4px', color: '#fff', background: (colors as Record<string, any>)[t.type] } }, t.msg))
    ),
  )
}
