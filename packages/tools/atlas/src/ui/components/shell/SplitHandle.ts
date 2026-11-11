import { el } from '../../kit'

/**
 * The horizontal divider between the canvas and the panels — row-resize
 * cursor, the panels' top hairline. ↑/↓ move it from the keyboard.
 */
export const SplitHandle = el
  .attrs({ tag: 'div' })
  .theme((t) => ({
    height: '5px',
    flex: 'none',
    cursor: 'row-resize',
    margin: '-2px 0 -3px',
    position: 'relative',
    zIndex: '3',
    background: 'transparent',
    extendCss: `&::after{content:'';position:absolute;left:0;right:0;top:2px;height:1px;background:${t.border};}transition:background ${t.motion.base};&:hover,&:focus-visible{background:${t.glow}!important;}&:active{background:${t.accent}!important;}`,
  }))
