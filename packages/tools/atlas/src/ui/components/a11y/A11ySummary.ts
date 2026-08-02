import { el, type T } from '../../kit'

export const A11ySummary = el
  .attrs({
    tag: 'div',
    contentDirection: 'inline',
    contentAlignY: 'center',
    gap: 16,
  })
  .theme((t: T) => ({
    marginBottom: '16px',
    padding: '16px',
    borderRadius: t.radius.card,
    border: t.hairline,
  }))
