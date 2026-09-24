/** The brand-theme color dot in a menu row — bg set per row via the css prop. */
import { el } from '../../kit'

export const MenuSwatch = el
  .attrs({ tag: 'span' })
  .theme((t) => ({
    width: '12px', height: '12px', borderRadius: t.radius.round, flex: 'none',
    // A ring that shows on BOTH surfaces — the hairline is the menu's own
    // border colour, so a near-black swatch (Contrast) vanished on the dark menu.
    extendCss: 'box-shadow:0 0 0 1px rgba(128,134,150,.55);',
  }))
