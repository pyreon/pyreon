import { el } from '../../kit'

/**
 * A component row that OWNS a folder: the component button plus a sibling
 * toggle for its parts. Siblings, never nested — a button inside a button is
 * invalid and swallows the inner click.
 */
export const CompRow = el
  .attrs({ tag: 'div', contentDirection: 'inline', contentAlignY: 'center', block: true, gap: 2 })
  .theme(() => ({
    marginBottom: '1px',
  }))
