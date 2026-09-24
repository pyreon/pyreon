import { el } from '../../kit'

export const UsagePre = el
  .attrs({
    tag: 'pre',
  })
  .theme((t) => ({
    margin: '0',
    padding: '16px',
    borderRadius: t.radius.card,
    fontFamily: t.font.mono,
    fontSize: t.size.input,
    lineHeight: '1.6',
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    background: t.codeBg,
    color: t.codeFg,
  }))
