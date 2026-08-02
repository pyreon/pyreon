import { dim, el, type T } from '../../kit'

export const CompBtn = el
  .attrs({
    tag: 'button',
    contentDirection: 'inline',
    contentAlignY: 'center',
    block: true,
    gap: 12,
  })
  .theme((t: T) => ({
    font: 'inherit',
    cursor: 'pointer',
    textAlign: 'left',
    border: 'none',
    padding: '8px 8px',
    borderRadius: t.radius.button,
    marginBottom: '1px',
    fontSize: t.size.item,
    transition: `background ${t.motion.fast}`,
    fontWeight: '500',
    color: t.muted,
    background: 'transparent',
    hover: { background: t.surface2 },
  }))
  .states(
    dim((t) => ({
      active: {
        fontWeight: 600,
        color: t.text,
        backgroundColor: t.accentSoft,
      },
      idle: {},
    })),
  )
