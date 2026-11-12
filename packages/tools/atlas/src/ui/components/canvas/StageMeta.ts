import { txt } from '../../kit'

/**
 * The render context in one line — brand, mode, pinned viewport, forced
 * pseudo state, locale — in the stage's corner, so a screenshot of the canvas
 * still says what it shows.
 */
export const StageMeta = txt.attrs({ tag: 'span' }).theme((t) => ({
  position: 'absolute',
  top: '8px',
  right: '10px',
  fontFamily: t.font.mono,
  fontSize: t.size.label,
  color: t.faint,
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
  extendCss: 'max-width:calc(100% - 20px);overflow:hidden;text-overflow:ellipsis;',
}))
