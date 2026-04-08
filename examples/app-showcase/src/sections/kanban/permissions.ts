import { createPermissions } from '@pyreon/permissions'

/**
 * Kanban permissions singleton.
 *
 * Same shape as the dashboard's permissions module — module-level
 * singleton flipped between admin and viewer by the toolbar role
 * toggle. The board components read `can('cards.write')` to disable
 * drag, the new-card button, and undo/redo when the user is in
 * viewer mode.
 */
export type Role = 'admin' | 'viewer'

const ADMIN_PERMS = {
  'cards.read': true,
  'cards.write': true,
}

const VIEWER_PERMS = {
  'cards.read': true,
  'cards.write': false,
}

export const kanbanPermissions = createPermissions(ADMIN_PERMS)

export function setKanbanRole(role: Role): void {
  kanbanPermissions.set(role === 'admin' ? ADMIN_PERMS : VIEWER_PERMS)
}

export function useKanbanPermissions() {
  return kanbanPermissions
}
