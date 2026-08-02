import { dim, el, type T } from '../../kit'

export const CompBtn = el
  .attrs({
    tag: 'button',
  })
  .theme((t: T) => ({
    flexDirection: 'row',
    font: 'inherit',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
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
