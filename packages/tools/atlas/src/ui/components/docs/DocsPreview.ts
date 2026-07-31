import { el, type T } from '../../kit'

export const DocsPreview = el
  .attrs({
    tag: 'div',
    css: 'display:flex;align-items:center;justify-content:center;',
  })
  .theme((t: T) => ({
    borderRadius: t.radius.stage,
    border: t.hairline,
    background: t.surface,
    padding: '48px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '26px',
  }))
