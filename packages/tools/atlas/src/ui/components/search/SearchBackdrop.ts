/**
 * Fixed dim backdrop behind the ⌘K dialog — clicking it closes. Mounted as a
 * PyreonUI sibling (outside <Shell>), so it must carry the sans stack itself.
 */
import { el } from '../../kit'

export const SearchBackdrop = el
  .attrs({ tag: 'div', contentDirection: 'rows', contentAlignX: 'center' })
  .theme((t) => ({
    position: 'fixed', top: '0', left: '0', right: '0', bottom: '0',
    zIndex: '80', fontFamily: t.font.sans, fontSize: t.size.heading, color: t.text,
    background: t.scrim,
    extendCss: 'backdrop-filter:blur(4px);',
  }))
