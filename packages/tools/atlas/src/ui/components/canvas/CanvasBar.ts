import { el, type T } from '../../kit'

export const CanvasBar = el
  .attrs({
    tag: 'div',
  })
  .theme((t: T) => ({
    flexDirection: 'row',
    height: '52px',
    flex: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '0 16px',
    borderBottom: t.hairline,
    background: t.surface,
  }))
