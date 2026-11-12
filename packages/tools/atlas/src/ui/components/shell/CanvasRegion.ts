import { el } from '../../kit'

/**
 * The canvas's share of the main column. Its `flex` grow factor is the live
 * split (set by the Workbench from `panelFrac`); the floor keeps the stage
 * usable however far the panels are dragged.
 */
export const CanvasRegion = el
  .attrs({ tag: 'div', contentDirection: 'rows', contentAlignX: 'block' })
  .theme(() => ({
    minHeight: '150px',
    minWidth: '0',
  }))
