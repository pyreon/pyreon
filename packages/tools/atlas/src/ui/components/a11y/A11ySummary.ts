import { el, type T } from '../../kit'

export const A11ySummary = el
  .attrs({
    tag: 'div',
  })
  .theme((t: T) => ({
    flexDirection: 'row',
    alignItems: 'center',
    display: 'flex',
    gap: '16px',
    marginBottom: '16px',
    padding: '16px',
    borderRadius: t.radius.card,
    border: t.hairline,
  }))
