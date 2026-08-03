/**
 * The drag strip between shell panels — col-resize cursor, accent on hover.
 * The drag logic lives in the Workbench (pointer capture on this element);
 * double-click collapses the neighboring panel.
 */
import { el, type T } from '../../kit'

export const ResizeHandle = el
  .attrs({ tag: 'div' })
  .theme((t: T) => ({
    width: '4px', flex: 'none', cursor: 'col-resize', background: 'transparent',
    extendCss: `transition:background .12s;&:hover{background:${t.accentSoft}!important;}&:active{background:${t.accent}!important;}`,
  }))
