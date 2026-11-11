import { el } from '../../kit'

/** One option in a `.seg2` group — pressed = raised surface + inset hairline. */
export const EnumBtn = el
  .attrs({
    tag: 'button',
  })
  .theme((t) => ({
    font: 'inherit',
    fontSize: t.size.small,
    cursor: 'pointer',
    height: '26px',
    padding: '0 10px',
    border: 'none',
    borderRadius: t.radius.button,
    whiteSpace: 'nowrap',
    transition: `color ${t.motion.fast},background ${t.motion.fast}`,
    color: t.faint,
    background: 'transparent',
    hover: { color: t.text },
  }))
  .states((t) => ({
    active: {
      color: t.text,
      backgroundColor: t.surface2,
      boxShadow: `inset 0 0 0 1px ${t.border}`,
    },
    idle: {},
  }))
