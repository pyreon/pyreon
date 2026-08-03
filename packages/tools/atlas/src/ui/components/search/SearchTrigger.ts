/** The top-bar search TRIGGER (docs-header style) — the real input lives in the ⌘K dialog. */
import { el, type T } from '../../kit'

export const SearchTrigger = el
  .attrs({ tag: 'button', contentDirection: 'inline', contentAlignY: 'center', gap: 8, block: true })
  .theme((t: T) => ({
    font: 'inherit', cursor: 'pointer', textAlign: 'left',
    maxWidth: '400px', padding: '8px 12px', borderRadius: t.radius.field,
    border: t.hairline, background: t.bg, color: t.faint, fontSize: t.size.text,
    extendCss: `margin:0 auto;&:hover{border-color:${t.accent};}`,
  }))
