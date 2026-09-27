import { el } from '../../kit'

export const CompBar = el
  .attrs({
    tag: 'span',
  })
  .theme((t) => ({
    width: '3px',
    height: '16px',
    borderRadius: t.radius.bar,
    flex: 'none',
    background: t.border,
  }))
  .states(
    (t) => ({
      active: { backgroundColor: t.accent },
      idle: {},
    }),
  )
