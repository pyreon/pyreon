/** One derived scenario under the SELECTED component — name + verdict dot. */
import { dim, el, type T } from '../../kit'

export const ScenBtn = el
  .attrs({
    tag: 'button',
    contentDirection: 'inline',
    contentAlignY: 'center',
    block: true,
    gap: 8,
  })
  .theme((t: T) => ({
    font: 'inherit',
    cursor: 'pointer',
    textAlign: 'left',
    border: 'none',
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
