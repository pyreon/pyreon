import { el } from '../../kit'

/**
 * A catalog row (`.at-g a`): 28px, verdict dot + name. Selected = the glow
 * tint with the accent edge. Indented by `data-depth`.
 */
export const CompBtn = el
  .attrs({
    tag: 'button',
    contentDirection: 'inline',
    contentAlignY: 'center',
    block: true,
    gap: 8,
  })
  .theme((t) => ({
    font: 'inherit',
    cursor: 'pointer',
    textAlign: 'left',
    border: 'none',
    height: '28px',
    padding: '0 12px',
    fontSize: t.size.text,
    color: t.muted,
    background: 'transparent',
    minWidth: '0',
    hover: { color: t.text, background: t.sheen },
    extendCss:
      '&[data-depth="2"]{padding-left:24px;}&[data-depth="3"]{padding-left:36px;}&[data-depth="4"]{padding-left:48px;}&[data-depth="5"]{padding-left:60px;}',
  }))
  .states((t) => ({
    active: {
      color: t.text,
      backgroundColor: t.glow,
      boxShadow: `inset 2px 0 0 ${t.accent}`,
    },
    idle: {},
  }))
