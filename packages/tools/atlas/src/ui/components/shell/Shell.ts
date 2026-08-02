import { el, type T } from '../../kit'

export const Shell = el
  .attrs({
    tag: 'div',
  })
  .theme((t: T) => ({
    alignItems: 'stretch',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    fontFamily: t.font.sans,
    fontSize: t.size.heading,
    background: t.bg,
    color: t.text,
    extendCss: '-webkit-font-smoothing:antialiased;',
  }))
