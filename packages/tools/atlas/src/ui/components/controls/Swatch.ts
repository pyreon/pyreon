import { dim, el, type T } from '../../kit'

export const Swatch = el
  .attrs({
    tag: 'button',
  })
  .theme((t: T) => ({
    cursor: 'pointer',
    width: '24px',
    height: '24px',
    borderRadius: t.radius.item,
    padding: '0',
    border: `2px solid ${t.border}`,
  }))
  .states(
    dim((t) => ({
      active: { borderColor: t.accent },
      idle: {},
    })),
  )
