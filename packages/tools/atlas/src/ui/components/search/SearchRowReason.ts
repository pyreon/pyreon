/** The matched-field chip on a keyword hit — says WHY this row surfaced. */
import { txt, type T } from '../../kit'

export const SearchRowReason = txt
  .attrs({ tag: 'span' })
  .theme((t: T) => ({
    fontFamily: t.font.mono, fontSize: t.size.nano, color: t.accent, flex: 'none',
    padding: '2px 8px', borderRadius: t.radius.chip,
    background: t.accentSoft,
    extendCss: 'white-space:nowrap;',
  }))
