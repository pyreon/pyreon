import { el } from '../../kit'

/**
 * A collapsible folder header (`.at-g h5`): mono caps, fog. A button with
 * `aria-expanded` — the disclosure pattern — indented by `data-depth`.
 */
export const GroupBtn = el
  .attrs({
    tag: 'button',
    contentDirection: 'inline',
    contentAlignY: 'center',
    block: true,
    gap: 6,
  })
  .theme((t) => ({
    font: 'inherit',
    cursor: 'pointer',
    textAlign: 'left',
    border: 'none',
    margin: '8px 0 2px',
    height: '24px',
    padding: '0 12px',
    fontFamily: t.font.mono,
    fontSize: t.size.label,
    letterSpacing: t.tracking.xxl,
    textTransform: 'uppercase',
    color: t.faint,
    background: 'transparent',
    hover: { color: t.text },
    extendCss:
      '&[data-depth="1"]{padding-left:24px;}&[data-depth="2"]{padding-left:36px;}&[data-depth="3"]{padding-left:48px;}',
  }))
