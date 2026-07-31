import { el } from '../../kit'

export const DocsArticle = el
  .attrs({
    tag: 'article',
    css: 'display:flex;flex-direction:column;align-items:stretch;',
  })
  .theme(() => ({
    maxWidth: '720px',
    margin: '0 auto',
  }))
