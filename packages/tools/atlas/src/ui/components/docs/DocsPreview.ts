import { el, type T } from '../../kit'

export const DocsPreview = el
  .attrs({
    tag: 'div',
    contentAlignX: 'center',
    contentAlignY: 'center',
  })
  .theme((t: T) => ({
    borderRadius: t.radius.stage,
    border: t.hairline,
    background: t.surface,
    padding: '48px',
    marginBottom: '24px',
  }))
