import { dim, el, type T } from '../../kit'

export const CompBtn = el
  .attrs({
    tag: 'button',
    css: 'display:flex;flex-direction:row;align-items:center;',
  })
  .theme((t: T) => ({
    font: 'inherit',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: '11px',
    padding: '8px 10px',
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
