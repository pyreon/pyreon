/** One derived scenario under the SELECTED component — name + verdict dot. */
import { dim, el, type T } from '../../kit'

export const ScenBtn = el
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
    gap: '8px',
    padding: '4px 8px 4px 32px',
    borderRadius: t.radius.item,
    fontSize: t.size.text,
    color: t.muted,
    background: 'transparent',
    hover: { background: t.surface2 },
  }))
  .states(
    dim((t) => ({
      active: {
        color: t.text,
        backgroundColor: t.accentSoft,
      },
      idle: {},
    })),
  )
