import { el } from '../../kit'

export const ResetBtn = el
  .attrs({
    tag: 'button',
  })
  .theme((t) => ({
    font: 'inherit',
    fontSize: t.size.small,
    cursor: 'pointer',
    margin: '10px 12px',
    height: '28px',
    padding: '0 12px',
    borderRadius: t.radius.button,
    border: t.hairline,
    background: 'transparent',
    color: t.muted,
    hover: { borderColor: t.border2, color: t.text },
    extendCss: 'align-self:flex-start;',
  }))
