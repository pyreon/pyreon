import { el, type T } from '../../kit'

export const CanvasBar = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignY: 'center',
    gap: 16,
  })
  .theme((t: T) => ({
    height: '52px',
    flex: 'none',
    padding: '0 16px',
    borderBottom: t.hairline,
    background: t.surface,
  }))
