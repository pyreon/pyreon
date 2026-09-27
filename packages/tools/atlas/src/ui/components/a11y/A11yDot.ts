import { el } from '../../kit'

export const A11yDot = el
  .attrs({
    tag: 'span',
  })
  .theme((t) => ({
    width: '9px',
    height: '9px',
    borderRadius: t.radius.round,
    background: t.ok,
  }))
  .states(
    (t) => ({
      ok: { backgroundColor: t.ok },
      warn: { backgroundColor: t.warn },
      danger: { backgroundColor: t.danger },
      unknown: { backgroundColor: t.faint },
    }),
  )
