import { el } from '../../kit'

export const DocsArticle = el
  .attrs({
    tag: 'article',
  })
  .theme(() => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    maxWidth: '720px',
    margin: '0 auto',
  }))
