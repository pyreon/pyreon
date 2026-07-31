import { txt, type T } from '../../kit'

export const DocsDesc = txt
  .attrs({
    tag: 'p',
  })
  .theme((t: T) => ({
    fontSize: t.size.hero,
    lineHeight: '1.6',
    margin: '0 0 26px',
    maxWidth: '600px',
    color: t.muted,
  }))
