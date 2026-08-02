import { el, type T } from '../../kit'

export const SideFoot = el
  .attrs({
    tag: 'div',
  })
  .theme((t: T) => ({
    flexDirection: 'row',
    borderTop: t.hairline,
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: t.size.small,
    color: t.muted,
  }))
