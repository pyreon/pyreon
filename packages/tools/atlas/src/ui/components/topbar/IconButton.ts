import { el } from '../../kit'

/** A 32px square icon button (`.ib`). Draws an SVG child at 15px. */
export const IconButton = el
  .attrs({
    tag: 'button',
    contentAlignX: 'center',
    contentAlignY: 'center',
  })
  .theme((t) => ({
    font: 'inherit',
    cursor: 'pointer',
    flex: 'none',
    width: '32px',
    height: '32px',
    padding: '0',
    borderRadius: t.radius.button,
    border: t.hairline,
    background: 'transparent',
    color: t.muted,
    hover: { color: t.text, borderColor: t.border2 },
    extendCss: '& svg{width:15px;height:15px;display:block;}',
  }))
