import { el } from '../../kit'

/**
 * The role cards, side by side (`.at-roles`). Auto-filled columns rather than
 * a fixed four: a project may declare two roles or seven, and a 320px phone
 * fits one card a row without scrolling sideways.
 */
export const RoleGrid = el.attrs({ tag: 'div', block: true }).theme(() => ({
  display: 'grid',
  gap: '10px',
  padding: '0 12px 12px',
  extendCss: 'grid-template-columns:repeat(auto-fill,minmax(200px,1fr));align-items:start;',
}))
