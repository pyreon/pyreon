import { el } from '../../kit'

export const DocsArticle = el
  .attrs({
    tag: 'article',
    contentDirection: 'rows',
    contentAlignX: 'block',
  })
  .theme(() => ({
    maxWidth: '720px',
    margin: '0 auto',
  }))
