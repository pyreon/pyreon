/** The top-bar search TRIGGER — the real input lives in the ⌘K dialog. */
import { el } from '../../kit'

export const SearchTrigger = el
  .attrs({ tag: 'button', contentDirection: 'inline', contentAlignY: 'center', gap: 8 })
  .theme((t) => ({
    font: 'inherit',
    cursor: 'pointer',
    flex: 'none',
    height: '32px',
    padding: '0 8px 0 10px',
    borderRadius: t.radius.button,
    border: t.hairline,
    background: t.bg,
    color: t.faint,
    fontSize: t.size.body,
    hover: { color: t.text, borderColor: t.border2 },
    // Compact: icon only — the label and the shortcut give way.
    extendCss:
      '& svg{width:14px;height:14px;display:block;}@media (max-width:859.98px){width:32px;padding:0;justify-content:center;& kbd{display:none;}}',
  }))
