import { el } from '../../kit'

export const OkDot = el
  .attrs({
    tag: 'span',
  })
  .theme((t) => ({
    width: '8px',
    height: '8px',
    borderRadius: t.radius.round,
    background: t.ok,
    boxShadow: `0 0 0 3px ${t.okSoft}`,
  }))
