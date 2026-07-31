import { txt, type T } from '../../kit'

export const A11yTitle = txt
  .attrs({
    tag: 'div',
  })
  .theme((t: T) => ({
    fontSize: t.size.text,
    fontWeight: '600',
    marginBottom: '2px',
  }))
