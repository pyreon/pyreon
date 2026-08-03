/**
 * Fixed dim backdrop behind the ⌘K dialog — clicking it closes. Mounted as a
 * PyreonUI sibling (outside <Shell>), so it must carry the sans stack itself.
 */
import { el, type T } from '../../kit'

export const SearchBackdrop = el
  .attrs({ tag: 'div', contentDirection: 'rows', contentAlignX: 'center' })
  .theme((t: T) => ({
    position: 'fixed', top: '0', left: '0', right: '0', bottom: '0',
    zIndex: '80', fontFamily: t.font.sans, fontSize: t.size.heading, color: t.text,
    extendCss: 'background:rgba(8,10,16,.55);backdrop-filter:blur(4px);',
  }))
