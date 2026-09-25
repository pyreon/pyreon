import { txt } from '../../kit'

export const A11yTitle = txt
  .attrs({
    tag: 'div',
  })
  .theme((t) => ({
    fontSize: t.size.text,
    fontWeight: '600',
    marginBottom: '2px',
  }))
