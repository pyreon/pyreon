import { el } from '../../kit'
import { EMBER_STOPS } from '../../theme'

/**
 * The Pyreon mark: the ember disc (a CSS gradient, drawn here) under the "n"
 * stroke the view draws as SVG. Geometry from the 120-unit logo: a r=22 disc
 * centred at (36, 64) — at 20px, 7.3px across at (6, 10.7).
 */
export const BrandMark = el
  .attrs({
    tag: 'span',
    contentAlignX: 'center',
    contentAlignY: 'center',
  })
  .theme((t) => ({
    position: 'relative',
    width: '20px',
    height: '20px',
    flex: 'none',
    color: t.text,
    extendCss: `&::before{content:'';position:absolute;left:2.3px;top:7px;width:7.4px;height:7.4px;border-radius:50%;background:linear-gradient(90deg,${EMBER_STOPS[0]},${EMBER_STOPS[1]} 55%,${EMBER_STOPS[2]});}& svg{position:relative;}`,
  }))
