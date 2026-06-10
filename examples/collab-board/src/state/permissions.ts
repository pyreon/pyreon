// Viewer/Editor mode — a CLIENT-SIDE UI gate via @pyreon/permissions. It only
// hides/disables write affordances (add-card, title, description). The REAL
// access control is the relay's `authorize` hook (see relay.ts) — a client gate
// is never security. This split is the honest pattern: permissions for UX,
// authorize for enforcement.
import { createPermissions } from '@pyreon/permissions'

export const can = createPermissions({ 'board.edit': true })

export function canEdit(): boolean {
  return can('board.edit')
}

export function setRole(role: 'editor' | 'viewer'): void {
  can.set({ 'board.edit': role === 'editor' })
}
