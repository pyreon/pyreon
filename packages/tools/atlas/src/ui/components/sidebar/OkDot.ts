import { el, type T } from '../../kit'

export const OkDot = el
  .attrs({
    tag: 'span',
  })
  .theme((t: T) => ({
    width: '8px',
    height: '8px',
    borderRadius: t.radius.round,
    background: t.ok,
    boxShadow: `0 0 0 3px ${t.okSoft}`,
  }))
