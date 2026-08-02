import { dim, el, type T } from '../../kit'

export const EnumBtn = el
  .attrs({
    tag: 'button',
  })
  .theme((t: T) => ({
    font: 'inherit',
    fontSize: t.size.body,
    cursor: 'pointer',
    padding: '8px 12px',
    borderRadius: t.radius.item,
    textTransform: 'capitalize',
    transition: `border-color ${t.motion.fast},color ${t.motion.fast}`,
    border: t.hairline,
    color: t.muted,
    background: 'transparent',
    hover: { borderColor: t.accent, color: t.text },
  }))
  .states(
    dim((t) => ({
      active: {
        borderColor: t.accent,
        color: t.text,
        backgroundColor: t.accentSoft,
      },
      idle: {},
    })),
  )
