import { txt } from '../../kit'

export const DocsDesc = txt
  .attrs({
    tag: 'p',
  })
  .theme((t) => ({
    fontSize: t.size.hero,
    lineHeight: '1.6',
    margin: '0 0 24px',
    maxWidth: '600px',
    color: t.muted,
  }))
