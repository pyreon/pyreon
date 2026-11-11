import { el } from '../../kit'

/** The panels' share of the main column — see `CanvasRegion`. */
export const PanelRegion = el
  .attrs({ tag: 'div', contentDirection: 'rows', contentAlignX: 'block' })
  .theme(() => ({
    minHeight: '120px',
    minWidth: '0',
  }))
