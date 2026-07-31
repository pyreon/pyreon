import { dim, el, type T } from '../../kit'

export const CompBar = el
  .attrs({
    tag: 'span',
  })
  .theme((t: T) => ({
    width: '3px',
    height: '15px',
    borderRadius: t.radius.bar,
    flex: 'none',
    background: t.border,
  }))
  .states(
    dim((t) => ({
      active: { backgroundColor: t.accent },
      idle: {},
    })),
  )
