import { el } from '../../kit'

export const Swatch = el
  .attrs({
    tag: 'button',
  })
  .theme((t) => ({
    cursor: 'pointer',
    width: '24px',
    height: '24px',
    borderRadius: t.radius.item,
    padding: '0',
    border: `2px solid ${t.border}`,
  }))
  .states(
    (t) => ({
      active: { borderColor: t.accent },
      idle: {},
    }),
  )
