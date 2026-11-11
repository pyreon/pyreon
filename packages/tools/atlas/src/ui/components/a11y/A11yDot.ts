import { el } from '../../kit'

export const A11yDot = el
  .attrs({
    tag: 'span',
  })
  .theme((t) => ({
    width: '7px',
    height: '7px',
    flex: 'none',
    borderRadius: t.radius.round,
    background: t.ok,
  }))
  .states((t) => ({
    ok: { backgroundColor: t.ok },
    warn: { backgroundColor: t.warn },
    danger: { backgroundColor: t.danger },
    unknown: { backgroundColor: t.faint },
  }))
