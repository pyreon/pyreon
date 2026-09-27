import { el } from '../../kit'

/**
 * A reactive node on the Why? panel. Full-strength text on a tinted surface —
 * the borrowed Controls `EnumBtn` rendered it muted-on-transparent (and
 * capitalised the framework's `derived#12` into `Derived#12`), which read as
 * disabled grey-on-grey. Mono, because a label is a source location.
 */
export const NodeChip = el
  .attrs({
    tag: 'button',
  })
  .theme((t) => ({
    font: 'inherit',
    fontFamily: t.font.mono,
    fontSize: t.size.meta,
    cursor: 'pointer',
    padding: '6px 10px',
    borderRadius: t.radius.item,
    border: t.hairline,
    color: t.text,
    backgroundColor: t.surface2,
    transition: `border-color ${t.motion.fast}`,
    hover: { borderColor: t.accent },
  }))
  .states(
    (t) => ({
      active: { borderColor: t.accent, backgroundColor: t.accentSoft },
      idle: {},
    }),
  )
