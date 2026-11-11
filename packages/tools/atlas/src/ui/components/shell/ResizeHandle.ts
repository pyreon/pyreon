import { el } from '../../kit'

/**
 * The vertical drag strip on the catalog's edge — col-resize cursor, accent
 * on hover / drag / focus. The drag logic lives in the Workbench (pointer
 * capture on this element); ←/→ move it from the keyboard.
 */
export const ResizeHandle = el
  .attrs({ tag: 'div' })
  .theme((t) => ({
    width: '5px',
    marginLeft: '-3px',
    flex: 'none',
    cursor: 'col-resize',
    background: 'transparent',
    position: 'relative',
    zIndex: '3',
    extendCss: `transition:background ${t.motion.base};&:hover,&:focus-visible{background:${t.glow}!important;}&:active{background:${t.accent}!important;}`,
  }))
