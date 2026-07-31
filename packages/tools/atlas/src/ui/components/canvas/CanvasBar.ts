import { el, type T } from '../../kit'

export const CanvasBar = el
  .attrs({
    tag: 'div',
    css: 'display:flex;flex-direction:row;align-items:center;',
  })
  .theme((t: T) => ({
    height: '52px',
    flex: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '0 16px',
    borderBottom: t.hairline,
    background: t.surface,
  }))
