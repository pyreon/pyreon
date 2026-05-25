/**
 * Shared types for the {{name}} monorepo. Import from the web app as:
 *
 *   import type { ButtonVariant, User } from '@{{name}}/types'
 *
 * Keep this package framework-agnostic — no Pyreon imports — so the
 * server / scripts / future apps can reuse it without dragging a UI
 * dependency through.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost'

export interface User {
  id: string
  name: string
  email: string
}
