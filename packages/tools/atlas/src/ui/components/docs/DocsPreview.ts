import { el, type T } from '../../kit'

export const DocsPreview = el
  .attrs({
    tag: 'div',
  })
  .theme((t: T) => ({
    borderRadius: t.radius.stage,
    border: t.hairline,
    background: t.surface,
    padding: '48px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '24px',
  }))
